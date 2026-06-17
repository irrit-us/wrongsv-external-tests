/**
 * HiddifyClient — Hiddify proxy app client implementation.
 *
 * Hiddify imports the config through an in-app debug extension that routes the
 * content through the app's own ProfileRepository path after launch.
 */

const path = require("path");
const fs = require("fs");
const { BaseClient } = require("../BaseClient");

class HiddifyClient extends BaseClient {
  static get app() {
    return "hiddify";
  }
  static get displayName() {
    return "hiddify";
  }

  get bundleRoot() {
    const builtBundle = path.join(
      this.repoRoot,
      "hiddify-next",
      "build",
      "linux",
      "x64",
      "profile",
      "bundle"
    );
    if (fs.existsSync(path.join(builtBundle, "hiddify"))) {
      return builtBundle;
    }
    return path.join(this.repoRoot, "binaries", "hiddify");
  }

  // ---- Paths ----
  get binaryPath() {
    return path.join(this.bundleRoot, "hiddify");
  }
  get libraryPath() {
    return path.join(this.bundleRoot, "lib");
  }
  get workDir() {
    return this.bundleRoot;
  }
  get defaultProxyPort() {
    return 2334; // Hiddify default sing-box mixed inbound
  }

  // ---- Extensions ----
  get extensions() {
    const prefix = "ext.hiddify";
    return new Map(
      Object.entries({
        connectProxy: {
          method: `${prefix}.connectProxy`,
          description: "Start the proxy engine (bypasses applyConfigOption gRPC)",
          timeout: 30000,
        },
        disconnectProxy: {
          method: `${prefix}.disconnectProxy`,
          description: "Stop the proxy engine",
          timeout: 15000,
        },
        getProxyStatus: {
          method: `${prefix}.getProxyStatus`,
          description: "Current proxy connection state",
          timeout: 10000,
        },
        runSelfTest: {
          method: `${prefix}.runSelfTest`,
          description: "Internal consistency checks",
          timeout: 15000,
        },
        getAppState: {
          method: `${prefix}.getAppState`,
          description: "Platform info and timestamp",
          timeout: 10000,
        },
        dumpSemantics: {
          method: `${prefix}.dumpSemantics`,
          description: "Full semantics tree as JSON",
          timeout: 15000,
        },
        dumpWidgetTree: {
          method: `${prefix}.dumpWidgetTree`,
          description: "Widget tree deep-string",
          timeout: 15000,
        },
        performSemanticsAction: {
          method: `${prefix}.performSemanticsAction`,
          description: "Perform an action on a semantics node",
          timeout: 15000,
        },
        importConfig: {
          method: `${prefix}.importConfig`,
          description: "Legacy alias for app-native config import",
          timeout: 15000,
        },
        importAndActivateConfig: {
          method: `${prefix}.importAndActivateConfig`,
          description: "Import a config file through the app repository path",
          timeout: 10000,
        },
      })
    );
  }

  // ---- Lifecycle ----

  /**
   * Hiddify: queue a config for app-native import after the GUI is ready.
   */
  async prepareConfig(configPath) {
    this.pendingImport = {
      filePath: path.resolve(configPath),
      profileName: "Test Profile",
    };

    const proxyPort = this.extractProxyPort(configPath);

    return { configDest: path.resolve(configPath), proxyPort };
  }

  /**
   * Extract listen_port from sing-box JSON config.
   */
  extractProxyPort(configPath) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const cfg = JSON.parse(raw);
      for (const inbound of cfg.inbounds || []) {
        if (inbound.listen_port) {
          return inbound.listen_port;
        }
      }
    } catch {
      // fall through
    }
    return this.defaultProxyPort;
  }

  /**
   * After Hiddify connects, the real proxy port may differ from the config port
   * because Hiddify auto-generates its own sing-box config. Read the real port
   * from current-config.json.
   *
   * @returns {number|null} real proxy port, or null if not determinable
   */
  detectRealProxyPort() {
    const currentConfig = path.join(this.dataDir, "data", "current-config.json");
    if (!fs.existsSync(currentConfig)) return null;

    try {
      const cfg = JSON.parse(fs.readFileSync(currentConfig, "utf-8"));
      for (const inbound of cfg.inbounds || []) {
        if (
          inbound.type === "mixed" ||
          inbound.type === "http" ||
          inbound.type === "socks"
        ) {
          return inbound.listen_port || null;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Dismiss the first-run onboarding screen if Hiddify opens there.
   */
  async afterLaunch(_vmUri, bridge) {
    if (!bridge) return;
    const dumpMeta = this.extensions.get("dumpSemantics");
    const tapMeta = this.extensions.get("performSemanticsAction");
    if (dumpMeta && tapMeta) {
      const startLabels = ["开始", "Start", "Get Started"];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let payload;
        try {
          payload = await bridge.callExtension(dumpMeta.method);
        } catch {
          break;
        }
        const text = JSON.stringify(payload);
        const label = startLabels.find((item) => text.includes(item));
        if (!label) {
          break;
        }
        try {
          await bridge.callExtension(tapMeta.method, {
            value: JSON.stringify({ action: "tap", label }),
          });
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!this.pendingImport) return;

    const importMeta =
      this.extensions.get("importAndActivateConfig") ||
      this.extensions.get("importConfig");
    if (!importMeta) return;

    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const result = await bridge.callExtension(importMeta.method, {
          value: JSON.stringify(this.pendingImport),
        });
        if (result?.error) {
          lastError = new Error(
            result.error.message || JSON.stringify(result.error)
          );
        } else if (result?.status === "error") {
          this.lastImportResult = result;
          lastError = new Error(
            result.error || JSON.stringify(result)
          );
        } else if (result?.status === "ok") {
          this.lastImportResult = result;
          this.pendingImport = null;
          return;
        } else {
          lastError = new Error(
            `unexpected import response: ${JSON.stringify(result)}`
          );
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(
      `[HiddifyClient] failed to import config via app extension: ${
        lastError?.message || "unknown error"
      }`
    );
  }

  // ---- Cleanup ----

  async cleanData() {
    if (this.runtimeRoot) {
      try {
        fs.rmSync(this.dataDir, { recursive: true, force: true });
      } catch (_) {}
      return;
    }

    // Remove config files that accumulate across runs
    const files = [
      path.join(this.dataDir, "config.json"),
      path.join(this.dataDir, "data", "current-config.json"),
    ];
    for (const f of files) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
    // Remove core-generated files (logs, temp)
    const coreData = path.join(this.dataDir, "data");
    const patterns = [".log", ".tmp"];
    if (fs.existsSync(coreData)) {
      try {
        for (const entry of fs.readdirSync(coreData)) {
          if (patterns.some((p) => entry.endsWith(p))) {
            try { fs.unlinkSync(path.join(coreData, entry)); } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }
}

module.exports = { HiddifyClient };
