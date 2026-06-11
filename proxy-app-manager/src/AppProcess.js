/**
 * AppProcess — Spawn and manage a Flutter proxy app process.
 *
 * Handles Xvfb headless display, LD_LIBRARY_PATH, stdout parsing for
 * VM service URI detection, and graceful process cleanup.
 *
 * Usage:
 *   const proc = new AppProcess({
 *     binary: './binaries/flclash/FlClash',
 *     libraryPath: './binaries/flclash/lib',
 *   });
 *   await proc.start();
 *   console.log(proc.vmUri);  // http://127.0.0.1:8181/abc=/
 *   await proc.stop();
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class AppProcess {
  /**
   * @param {Object} options
   * @param {string} options.binary - path to the app executable
   * @param {string} [options.libraryPath] - LD_LIBRARY_PATH entries
   * @param {string} [options.workDir] - working directory (default: binary's dir)
   * @param {boolean} [options.headless=true] - use Xvfb virtual display
   * @param {number} [options.display] - X display number (auto-assigned if omitted)
   * @param {RegExp} [options.vmUriPattern] - regex to extract VM URI from stdout
   * @param {number} [options.launchTimeout=60000] - max wait for VM URI
   * @param {Object} [options.env] - extra environment variables
   */
  constructor(options = {}) {
    this.binary = options.binary;
    this.libraryPath = options.libraryPath || "";
    this.workDir = options.workDir || path.dirname(this.binary);
    this.headless = options.headless !== false;
    this.display = options.display || Math.floor(Math.random() * 100 + 99);
    this.vmUriPattern =
      options.vmUriPattern ||
      /(?:Observatory|Dart VM Service).+?(http:\/\/[\d.]+:\d+\/[^/\s]+=)/i;
    this.launchTimeout = options.launchTimeout || 60000;
    this.extraEnv = options.env || {};

    /** @type {import('child_process').ChildProcess|null} */
    this.appProcess = null;
    /** @type {import('child_process').ChildProcess|null} */
    this.xvfbProcess = null;

    /** @type {string|null} */
    this.vmUri = null;
    /** @type {string} */
    this.logPath = "";
    /** @type {string[]} */
    this._stdoutLines = [];
  }

  /**
   * Start Xvfb (if headless) and launch the app binary.
   * Waits for the VM service URI to appear in stdout.
   * @returns {Promise<void>}
   */
  async start() {
    // --- Xvfb ---
    if (this.headless) {
      await this._startXvfb();
    }

    // --- Environment ---
    const env = {
      ...process.env,
      DISPLAY: `:${this.display}`,
      ...this.extraEnv,
    };
    if (this.libraryPath) {
      env.LD_LIBRARY_PATH = `${this.libraryPath}:${env.LD_LIBRARY_PATH || ""}`;
    }

    // --- Log file ---
    const appName = path.basename(this.binary);
    this.logPath = `/tmp/${appName}_manager_${Date.now()}.log`;

    // --- Spawn ---
    this.appProcess = spawn(this.binary, [], {
      cwd: this.workDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const logStream = fs.createWriteStream(this.logPath);

    // --- Parse stdout for VM URI ---
    const vmPromise = new Promise((resolve) => {
      const onData = (data) => {
        const text = data.toString();
        this._stdoutLines.push(text);
        logStream.write(text);

        const match = text.match(this.vmUriPattern);
        if (match) {
          this.vmUri = match[1] || match[0];
          this.vmUri = this.vmUri.replace(/\/$/, "");
          resolve(true);
        }
      };

      this.appProcess.stdout.on("data", onData);
      this.appProcess.stderr.on("data", (d) => logStream.write(d));

      this.appProcess.on("exit", (code) => {
        if (!this.vmUri) {
          resolve(false);
        }
      });

      this.appProcess.on("error", () => resolve(false));
    });

    // --- Wait for VM URI or timeout ---
    const timeoutPromise = new Promise((r) =>
      setTimeout(() => r(false), this.launchTimeout)
    );

    const found = await Promise.race([vmPromise, timeoutPromise]);

    if (!found) {
      // Read the log for diagnostics
      const logTail = this._stdoutLines.slice(-10).join("");
      throw new Error(
        `VM service URI not detected within ${this.launchTimeout}ms.\n` +
          `Log: ${this.logPath}\n` +
          `Last output:\n${logTail}`
      );
    }
  }

  /**
   * Start Xvfb on the assigned display.
   */
  async _startXvfb() {
    return new Promise((resolve, reject) => {
      this.xvfbProcess = spawn("Xvfb", [
        `:${this.display}`,
        "-screen", "0",
        "1024x768x24",
      ], {
        stdio: "ignore",
        detached: false,
      });

      this.xvfbProcess.on("error", (err) => {
        reject(new Error(`Failed to start Xvfb: ${err.message}`));
      });

      // Xvfb starts quickly — short wait then proceed
      setTimeout(resolve, 500);
    });
  }

  /**
   * Read the current VM URI from the log file (for reconnect scenarios).
   * @returns {string|null}
   */
  readVmUriFromLog() {
    if (!this.logPath || !fs.existsSync(this.logPath)) return null;
    const content = fs.readFileSync(this.logPath, "utf-8");
    const match = content.match(this.vmUriPattern);
    return match ? match[1] || match[0] : null;
  }

  /**
   * Check if the app is still running.
   * @returns {boolean}
   */
  isRunning() {
    return this.appProcess && this.appProcess.exitCode === null;
  }

  /**
   * Gracefully stop the app and Xvfb.
   * @param {boolean} [force=false] - send SIGKILL instead of SIGTERM
   */
  async stop(force = false) {
    const signal = force ? "SIGKILL" : "SIGTERM";

    if (this.appProcess) {
      try {
        this.appProcess.kill(signal);
      } catch (_) {
        // already dead
      }
      this.appProcess = null;
    }

    if (this.xvfbProcess) {
      try {
        this.xvfbProcess.kill("SIGTERM");
      } catch (_) {
        // already dead
      }
      this.xvfbProcess = null;
    }
  }
}

module.exports = { AppProcess };
