/**
 * ProxyAppManager — Full lifecycle orchestrator for proxy app testing.
 *
 * Wires together AppProcess, VmBridge, and a Client implementation to provide
 * a clean programmatic API for the complete proxy app lifecycle:
 *
 *   launch → connectProxy → [test/evaluate] → disconnectProxy → shutdown
 *
 * Usage:
 *   const { ProxyAppManager } = require('proxy-app-manager');
 *   const mgr = new ProxyAppManager({
 *     app: 'flclash',
 *     config: './configs/sample-clash-config.yaml',
 *   });
 *   await mgr.launch();
 *   await mgr.connectProxy();
 *   const status = await mgr.getStatus();
 *   await mgr.shutdown();
 */

const path = require("path");
const { AppProcess } = require("./AppProcess");
const { VmBridge } = require("./VmBridge");
const { registry } = require("./clients/registry");

class ProxyAppManager {
  /**
   * @param {Object} options
   * @param {string} options.app - client name ("flclash" | "hiddify")
   * @param {string} options.config - path to proxy config file
   * @param {string} [options.repoRoot] - path to wrongsv-external-tests (auto-detected)
   * @param {boolean} [options.headless=true] - use Xvfb virtual display
   * @param {number} [options.timeout=60000] - launch timeout in ms
   * @param {string} [options.binariesDir] - override binaries directory
   */
  constructor(options = {}) {
    if (!options.app) throw new Error("options.app is required");
    if (!options.config) throw new Error("options.config is required");

    this.appName = options.app;
    this.configPath = path.resolve(options.config);
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 60000;

    // Resolve repo root
    this.repoRoot =
      options.repoRoot ||
      path.resolve(__dirname, "..", "..");

    // Look up client
    const ClientClass = registry.get(this.appName);
    if (!ClientClass) {
      throw new Error(
        `Unknown app: "${this.appName}". Registered: ${registry.appNames().join(", ")}`
      );
    }
    /** @type {import('./BaseClient').BaseClient} */
    this.client = new ClientClass(this.repoRoot, {
      runtimeRoot: options.runtimeRoot,
    });

    /** @type {AppProcess|null} */
    this.process = null;
    /** @type {VmBridge|null} */
    this.bridge = null;

    // State
    this.proxyPort = null;
    this.configDest = null;
    this.vmUri = null;
    this._launched = false;
  }

  // =========================================================================
  // Lifecycle: launch → connect → [test] → disconnect → shutdown
  // =========================================================================

  /**
   * Prepare config and launch the app. Detects VM service URI.
   *
   * @returns {Promise<{vmUri: string, proxyPort: number, configDest: string}>}
   */
  async launch() {
    if (this._launched) {
      throw new Error("Already launched. Call shutdown() first.");
    }

    // ---- Client hooks ----
    const { configDest, proxyPort } = await this.client.prepareConfig(
      this.configPath
    );
    this.configDest = configDest;
    this.proxyPort = proxyPort;

    await this.client.beforeLaunch();

    // ---- Spawn process ----
    this.process = new AppProcess({
      binary: this.client.binaryPath,
      libraryPath: this.client.libraryPath,
      workDir: this.client.workDir,
      headless: this.headless,
      vmUriPattern: this.client.vmUriPattern,
      launchTimeout: this.timeout,
      env: this.client.environment,
    });

    await this.process.start();
    this.vmUri = this.process.vmUri;

    // ---- Connect VM bridge ----
    this.bridge = new VmBridge(this.vmUri, { timeout: this.timeout });
    await this.bridge.connect();

    // ---- Wait for extensions to be ready ----
    // The VM service can be available before the app has finished async
    // initialization (e.g., FlClash's globalState.init()), which means
    // custom extensions may not be registered yet. Poll a basic extension
    // until it responds without "Method not found".
    await this._waitForExtensions(15000);

    // ---- Post-launch hook ----
    await this.client.afterLaunch(this.vmUri, this.bridge);

    this._launched = true;

    return {
      vmUri: this.vmUri,
      proxyPort: this.proxyPort,
      configDest: this.configDest,
    };
  }

  /**
   * Connect the proxy via the client's connectProxy extension.
   * @returns {Promise<Object>}
   */
  async connectProxy() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("connectProxy");
    let result = await this.bridge.callExtension(meta.method);

    if (
      this.appName === "hiddify" &&
      result?.connectResult !== "ok" &&
      this.client.extensions.has("performSemanticsAction")
    ) {
      for (const label of ["点击连接", "Connect", "Start"]) {
        try {
          await this.bridge.callExtension(
            this.client.extensions.get("performSemanticsAction").method,
            {
              value: JSON.stringify({ action: "tap", label }),
            }
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
          result = await this.bridge.callExtension(meta.method);
          if (result?.connectResult === "ok") {
            break;
          }
        } catch (_) {}
      }
    }

    // Hiddify may use a different port than the config specifies
    if (this.appName === "hiddify") {
      const realPort = this.client.detectRealProxyPort();
      if (realPort) {
        this.proxyPort = realPort;
      }
    }

    return result;
  }

  /**
   * Disconnect the proxy via the client's disconnectProxy extension.
   * @returns {Promise<Object>}
   */
  async disconnectProxy() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("disconnectProxy");
    return this.bridge.callExtension(meta.method);
  }

  /**
   * Get current proxy status.
   * @returns {Promise<Object>}
   */
  async getStatus() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("getProxyStatus");
    return this.bridge.callExtension(meta.method);
  }

  /**
   * Run the app's self-test.
   * @returns {Promise<Object>}
   */
  async runSelfTest() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("runSelfTest");
    return this.bridge.callExtension(meta.method);
  }

  /**
   * Dump the semantics tree.
   * @returns {Promise<Object>}
   */
  async dumpSemantics() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("dumpSemantics");
    return this.bridge.callExtension(meta.method);
  }

  /**
   * Dump the widget tree.
   * @returns {Promise<Object>}
   */
  async dumpWidgetTree() {
    this._ensureLaunched();
    const meta = this.client.extensions.get("dumpWidgetTree");
    return this.bridge.callExtension(meta.method);
  }

  /**
   * Perform a semantics action (tap, longPress, etc.) by label or node ID.
   *
   * @param {Object} params
   * @param {string} params.action - e.g. "tap", "longPress"
   * @param {string} [params.label] - search by semantics label
   * @param {number} [params.id] - target semantics node ID
   * @returns {Promise<Object>}
   */
  async performSemanticsAction({ action, label, id }) {
    this._ensureLaunched();
    const meta = this.client.extensions.get("performSemanticsAction");
    return this.bridge.callExtension(meta.method, {
      value: JSON.stringify({ action, label, id }),
    });
  }

  /**
   * Call any registered extension by name.
   *
   * @param {string} name - extension key (e.g. "connectProxy", "getAppState")
   * @param {Object} [params={}] - additional parameters
   * @returns {Promise<Object>}
   */
  async callExtension(name, params = {}) {
    this._ensureLaunched();
    const meta = this.client.extensions.get(name);
    if (!meta) {
      const available = Array.from(this.client.extensions.keys()).join(", ");
      throw new Error(
        `Unknown extension "${name}" for ${this.appName}. Available: ${available}`
      );
    }
    return this.bridge.callExtension(meta.method, params);
  }

  /**
   * Get the proxy URL (socks5://127.0.0.1:PORT).
   * @returns {string}
   */
  getProxyUrl() {
    return `socks5://127.0.0.1:${this.proxyPort}`;
  }

  // =========================================================================
  // Combined: full test cycle
  // =========================================================================

  /**
   * Run the full lifecycle: launch → connect → evaluate → disconnect → shutdown.
   *
   * @param {Object} [options]
   * @param {string} [options.suite="latency"] - test suite name for the evaluator
   * @param {string} [options.outputDir] - results output directory
   * @param {boolean} [options.skipShutdown=false] - leave app running after test
   * @returns {Promise<{launch: Object, connect: Object, status: Object, selfTest: Object, evaluation: Object|null}>}
   */
  async fullTest(options = {}) {
    const suite = options.suite || "latency";
    const outputDir = options.outputDir || `./results/${this.appName}-${Date.now()}`;
    const skipShutdown = options.skipShutdown || false;

    const results = {};

    // 1. Launch
    results.launch = await this.launch();

    // 2. Connect proxy
    results.connect = await this.connectProxy();

    // 3. Proxy status
    results.status = await this.getStatus();

    // 4. Self-test
    results.selfTest = await this.runSelfTest();

    // 5. Proxy evaluation (if evaluator available)
    results.evaluation = null;
    try {
      const { Evaluator } = require("../../proxy-testing-framework/evaluator");
      const evaluator = new Evaluator({
        proxy: this.getProxyUrl(),
        outputDir,
      });
      results.evaluation = await evaluator.runSuite(suite);
    } catch (err) {
      results.evaluation = { error: err.message, skipped: true };
    }

    // 6. Disconnect
    results.disconnect = await this.disconnectProxy();

    // 7. Shutdown
    if (!skipShutdown) {
      await this.shutdown();
    }

    return results;
  }

  // =========================================================================
  // Shutdown & Cleanup
  // =========================================================================

  /**
   * Gracefully stop the app, close bridge, and clean up processes.
   * Does NOT remove data files by default — use cleanup() for that.
   *
   * @param {boolean} [clean=false] — also remove config/log files
   */
  async shutdown(clean = false) {
    if (this.bridge) {
      try {
        await this.bridge.disconnect();
      } catch (_) {
        // ignore
      }
      this.bridge = null;
    }

    if (this.process) {
      try {
        await this.process.stop(false, clean);
      } catch (_) {
        // ignore
      }
      this.process = null;
    }

    if (clean) {
      await this._cleanData();
    }

    this._launched = false;
    this.vmUri = null;
  }

  /**
   * Remove all test artifacts: config files, app data, logs.
   * Safe to call after shutdown or independently.
   */
  async cleanup() {
    // Kill processes first if still running
    if (this.process) {
      try { await this.process.stop(false, true); } catch (_) {}
      this.process = null;
    }
    if (this.bridge) {
      try { await this.bridge.disconnect(); } catch (_) {}
      this.bridge = null;
    }

    await this._cleanData();
    this._launched = false;
    this.vmUri = null;
  }

  /**
   * Remove config and data files created during the test.
   * @internal
   */
  async _cleanData() {
    if (this.client && typeof this.client.cleanData === "function") {
      try { await this.client.cleanData(); } catch (_) {}
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  _ensureLaunched() {
    if (!this._launched || !this.bridge || !this.process) {
      throw new Error("Not launched. Call launch() first.");
    }
    if (!this.process.isRunning()) {
      throw new Error(
        `App process exited unexpectedly. Check log: ${this.process.logPath}`
      );
    }
  }

  /**
   * Wait for custom service extensions to be registered.
   * The VM service can become available before the app's async init
   * (e.g., globalState.init) completes, so we retry a basic extension.
   *
   * @param {number} [timeoutMs=15000]
   */
  async _waitForExtensions(timeoutMs = 15000) {
    const start = Date.now();
    const appPrefix = `ext.${this.appName}`;
    // Use getAppState as the canary — it's always registered first and has no deps.
    const canary = `${appPrefix}.getAppState`;

    while (Date.now() - start < timeoutMs) {
      try {
        const resp = await this.bridge.call(canary, {
          isolateId: this.bridge._isolateId,
        });
        if (resp && !resp.error) {
          return; // Extensions are ready
        }
      } catch (_) {
        // retry
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    // If we time out, continue anyway — some extensions might still work
  }
}

module.exports = { ProxyAppManager };
