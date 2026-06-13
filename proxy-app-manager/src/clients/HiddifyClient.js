/**
 * HiddifyClient — Hiddify proxy app client implementation.
 *
 * Hiddify requires the config to be imported into its SQLite database
 * as a profile. This is done via a child Python process (import-hiddify-config.py)
 * that writes directly to the database.
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { BaseClient } = require("../BaseClient");

class HiddifyClient extends BaseClient {
  static get app() {
    return "hiddify";
  }
  static get displayName() {
    return "hiddify";
  }

  // ---- Paths ----
  get binaryPath() {
    return path.join(this.repoRoot, "binaries", "hiddify", "hiddify");
  }
  get libraryPath() {
    return path.join(this.repoRoot, "binaries", "hiddify", "lib");
  }
  get workDir() {
    return path.join(this.repoRoot, "binaries", "hiddify");
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
          description: "Import a config file as a profile",
          timeout: 10000,
        },
      })
    );
  }

  // ---- Lifecycle ----

  /**
   * Hiddify: import config into SQLite database via Python script.
   */
  async prepareConfig(configPath) {
    const importScript = path.join(
      this.repoRoot,
      "scripts",
      "import-hiddify-config.py"
    );

    if (fs.existsSync(importScript)) {
      try {
        execSync(
          `python3 "${importScript}" --config "${configPath}" --data-dir "${this.dataDir}" --profile-name "Test Profile"`,
          { stdio: "pipe", timeout: 10000 }
        );
      } catch (err) {
        // Non-fatal: the app may still find the config if it was previously imported
        if (process.env.DEBUG) {
          console.error("[HiddifyClient] Config import warning:", err.message);
        }
      }
    }

    const proxyPort = this.extractProxyPort(configPath);

    return { configDest: path.join(this.dataDir, "config.json"), proxyPort };
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
    if (!dumpMeta || !tapMeta) return;

    const startLabels = ["开始", "Start", "Get Started"];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let payload;
      try {
        payload = await bridge.callExtension(dumpMeta.method);
      } catch {
        return;
      }
      const text = JSON.stringify(payload);
      const label = startLabels.find((item) => text.includes(item));
      if (!label) {
        return;
      }
      try {
        await bridge.callExtension(tapMeta.method, {
          value: JSON.stringify({ action: "tap", label }),
        });
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
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
