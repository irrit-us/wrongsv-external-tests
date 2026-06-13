/**
 * BaseClient — Abstract interface for proxy app clients.
 *
 * Every proxy app (FlClash, Hiddify, etc.) extends this class and overrides
 * the hooks as needed. The ProxyAppManager calls these methods in the standard
 * lifecycle order:
 *
 *   prepareConfig → beforeLaunch → launch (AppProcess) → afterLaunch
 *   → connectProxy → [test] → disconnectProxy → shutdown
 *
 * Subclass contract:
 *   - Must set static `app` (machine name) and `displayName`
 *   - Must implement `get binaryPath()` and `get libraryPath()`
 *   - Should implement `get extensions()` to declare available VM extensions
 *   - May override lifecycle hooks (prepareConfig, beforeLaunch, afterLaunch)
 */

const os = require("os");
const path = require("path");

class BaseClient {
  /** @returns {string} Machine name (e.g. "flclash", "hiddify") */
  static get app() {
    throw new Error("Subclass must define static app");
  }

  /** @returns {string} Human-readable name */
  static get displayName() {
    return this.app;
  }

  // =========================================================================
  // Paths & defaults (override in subclasses)
  // =========================================================================

  /**
   * @param {string} repoRoot - path to the wrongsv-external-tests repo
   */
  constructor(repoRoot, options = {}) {
    this.repoRoot = repoRoot;
    this.runtimeRoot = options.runtimeRoot || null;
  }

  /** @returns {string} Absolute path to the app executable */
  get binaryPath() {
    throw new Error("Subclass must implement binaryPath");
  }

  /** @returns {string} Absolute path to the bundled lib/ directory */
  get libraryPath() {
    return path.join(path.dirname(this.binaryPath), "lib");
  }

  /** @returns {string} App data directory (XDG_DATA_HOME based) */
  get dataDir() {
    if (this.runtimeRoot) {
      return path.join(this.runtimeRoot, this.constructor.displayName);
    }
    const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share");
    return path.join(xdg, this.constructor.displayName);
  }

  /** @returns {string} Working directory when launching */
  get workDir() {
    return path.dirname(this.binaryPath);
  }

  /** @returns {number} Fallback proxy port if config doesn't specify */
  get defaultProxyPort() {
    return 1080;
  }

  /** @returns {Object<string, string>} Extra environment for the app process */
  get environment() {
    return this.runtimeRoot
      ? {
          XDG_DATA_HOME: this.runtimeRoot,
        }
      : {};
  }

  /**
   * Regex to detect the VM service URI in the app's stdout.
   * Group 1 = the full URI, or the whole match.
   */
  get vmUriPattern() {
    return /(?:Observatory|Dart VM Service).+?(http:\/\/[\d.]+:\d+\/[^/\s]+=)/i;
  }

  // =========================================================================
  // Extensions — declare what this client supports
  // =========================================================================

  /**
   * Map of extension name → metadata.
   * Override to declare client-specific extensions.
   *
   * @returns {Map<string, {method: string, description: string, timeout?: number}>}
   */
  get extensions() {
    return new Map();
  }

  // =========================================================================
  // Lifecycle hooks
  // =========================================================================

  /**
   * Prepare/install the config file before launch.
   * Called before the app process starts.
   *
   * @param {string} configPath - absolute path to the config file
   * @returns {Promise<{configDest: string, proxyPort: number}>}
   */
  async prepareConfig(configPath) {
    return { configDest: configPath, proxyPort: this.defaultProxyPort };
  }

  /**
   * Hook called just before spawning the app process.
   * Use for environment setup, file creation, etc.
   */
  async beforeLaunch() {}

  /**
   * Hook called after the app has started and VM URI is detected.
   * Use for post-launch initialization (e.g. waiting for UI readiness).
   *
   * @param {string} _vmUri - the detected VM service URI
   */
  async afterLaunch(_vmUri) {}

  /**
   * Extract the proxy port from a parsed config.
   * Override per config format (YAML for Clash, JSON for sing-box).
   *
   * @param {string} _configPath
   * @returns {number}
   */
  extractProxyPort(_configPath) {
    return this.defaultProxyPort;
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Remove installed config and data files created during testing.
   * Override to clean app-specific data. Called by ProxyAppManager.cleanup().
   *
   * Subclasses should remove the config file they installed and any
   * app-generated data that accumulates across runs.
   */
  async cleanData() {}
}

module.exports = { BaseClient };
