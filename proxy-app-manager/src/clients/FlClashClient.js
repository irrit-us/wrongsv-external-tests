/**
 * FlClashClient — FlClash proxy app client implementation.
 *
 * FlClash reads config.yaml directly from its data directory.
 * No database import needed — just copy the file.
 */

const path = require("path");
const fs = require("fs");
const { BaseClient } = require("../BaseClient");

// Try to load yaml for port extraction; fall back to defaults if unavailable
let yaml;
try {
  yaml = require("js-yaml");
} catch (_) {
  yaml = null;
}

class FlClashClient extends BaseClient {
  static get app() {
    return "flclash";
  }
  static get displayName() {
    return "FlClash";
  }

  // ---- Paths ----
  get binaryPath() {
    return path.join(this.repoRoot, "binaries", "flclash", "FlClash");
  }
  get libraryPath() {
    return path.join(this.repoRoot, "binaries", "flclash", "lib");
  }
  get workDir() {
    return path.join(this.repoRoot, "binaries", "flclash");
  }
  get defaultProxyPort() {
    return 7890; // Clash default mixed-port
  }

  // ---- Extensions ----
  get extensions() {
    const prefix = "ext.flclash";
    return new Map(
      Object.entries({
        connectProxy: {
          method: `${prefix}.connectProxy`,
          description: "Start the proxy engine",
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
      })
    );
  }

  // ---- Lifecycle ----

  /**
   * FlClash: just copy the config file to the data directory.
   */
  async prepareConfig(configPath) {
    const dest = path.join(this.dataDir, "config.yaml");
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.copyFileSync(configPath, dest);

    const proxyPort = this.extractProxyPort(configPath);

    return { configDest: dest, proxyPort };
  }

  /**
   * Extract mixed-port from Clash YAML config.
   */
  extractProxyPort(configPath) {
    if (!yaml) {
      // Fallback: try to parse as JSON (some Clash configs are JSON)
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const cfg = JSON.parse(raw);
        return cfg["mixed-port"] || cfg["port"] || cfg["socks-port"] || this.defaultProxyPort;
      } catch {
        return this.defaultProxyPort;
      }
    }

    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const cfg = yaml.load(raw);
      return cfg["mixed-port"] || cfg["port"] || cfg["socks-port"] || this.defaultProxyPort;
    } catch {
      return this.defaultProxyPort;
    }
  }
}

module.exports = { FlClashClient };
