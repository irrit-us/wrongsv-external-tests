/**
 * VmBridge — Pure Node.js WebSocket bridge to the Dart VM Service.
 *
 * Connects to a Flutter app's VM service (profile/debug mode) and provides
 * JSON-RPC call capabilities. Replaces flutter_debug_bridge.py with zero
 * Python dependency.
 *
 * Usage:
 *   const bridge = new VmBridge('http://127.0.0.1:8181/abc=/');
 *   await bridge.connect();
 *   const result = await bridge.callExtension('ext.flclash.connectProxy');
 *   await bridge.disconnect();
 */

const WebSocket = require("ws");

class VmBridge {
  /**
   * @param {string} vmUri - VM service URI (http://host:port/auth-token=/)
   * @param {Object} [options]
   * @param {number} [options.timeout=30000] - request timeout in ms
   * @param {number} [options.connectTimeout=15000] - connection timeout in ms
   */
  constructor(vmUri, options = {}) {
    this.vmUri = vmUri.replace(/\/$/, "");
    this.timeout = options.timeout || 30000;
    this.connectTimeout = options.connectTimeout || 15000;

    // Convert http:// → ws://, append /ws
    this.wsUri = this.vmUri.replace("http://", "ws://") + "/ws";

    /** @type {WebSocket|null} */
    this.ws = null;
    this._requestId = 0;
    this._pending = new Map();
    this._isolateId = null;
  }

  /**
   * Establish WebSocket connection and resolve the main isolate.
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (this.ws) return true;

    const ws = new WebSocket(this.wsUri);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`VM service connection timed out after ${this.connectTimeout}ms`));
      }, this.connectTimeout);

      const cleanup = () => {
        clearTimeout(timer);
        ws.removeAllListeners();
      };

      ws.on("open", async () => {
        clearTimeout(timer);
        this._startReader();

        try {
          // Resolve the main isolate (extensions are registered on it).
          // Service/worker isolates don't have custom extensions.
          const vm = await this.call("getVM");
          const isolates = vm?.result?.isolates || [];
          const main = isolates.find((i) => i.name === "main") || isolates[0];
          if (main) {
            this._isolateId = main.id;
          }
          resolve(true);
        } catch (err) {
          resolve(true); // Still usable even without isolate
        }
      });

      ws.on("error", (err) => {
        cleanup();
        reject(new Error(`VM service WebSocket error: ${err.message}`));
      });

      ws.on("close", () => {
        cleanup();
      });
    });
  }

  /**
   * Connect with exponential backoff. For apps still starting up.
   * @param {number} [maxRetries=10]
   * @param {number} [baseDelay=500]
   * @returns {Promise<boolean>}
   */
  async connectWithRetry(maxRetries = 10, baseDelay = 500) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const ok = await this.connect();
        if (ok) return true;
      } catch (_) {
        // continue
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
    return false;
  }

  /**
   * Start the background reader loop that dispatches responses to pending requests.
   */
  _startReader() {
    this.ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      const id = msg.id;
      if (id != null && this._pending.has(id)) {
        const { resolve } = this._pending.get(id);
        this._pending.delete(id);
        resolve(msg);
      }
    });
  }

  /**
   * Send a JSON-RPC call and return the full response.
   * @param {string} method
   * @param {Object} [params={}]
   * @returns {Promise<Object>}
   */
  call(method, params = {}) {
    if (!this.ws) {
      throw new Error("Not connected. Call connect() first.");
    }

    const id = ++this._requestId;
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request "${method}" timed out after ${this.timeout}ms`));
      }, this.timeout);

      this._pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });

      this.ws.send(request);
    });
  }

  /**
   * Call a Flutter service extension (ext.<app>.*).
   *
   * @param {string} extension - e.g. "ext.flclash.connectProxy"
   * @param {Object} [params={}] - additional params; 'value' is JSON-stringified
   * @returns {Promise<Object>} parsed result from the extension
   */
  async callExtension(extension, params = {}) {
    const merged = { isolateId: this._isolateId, ...params };
    const response = await this.call(extension, merged);

    // If there's an error, return it as-is so callers can inspect response.error
    if (response.error) return response;

    // Service extensions return their result in different shapes depending on
    // how the VM service serializes them:
    //
    // 1) Direct: { result: { status: "connected", ... } }
    //    The extension's jsonEncode output is placed directly in result.
    //
    // 2) Wrapped: { result: { type: "Extension", result: "<json-string>" } }
    //    The extension's jsonEncode output is a JSON string in result.result.
    const outer = response?.result;

    if (outer && typeof outer === "object") {
      // Case 2: double-wrapped
      if (typeof outer.result === "string") {
        try {
          return JSON.parse(outer.result);
        } catch {
          return outer.result;
        }
      }
      // Case 2b: result.result is already an object
      if (outer.result && typeof outer.result === "object") {
        return outer.result;
      }
      // Case 1: direct — return the result object as-is
      return outer;
    }

    return response;
  }

  /**
   * Close the WebSocket connection.
   */
  async disconnect() {
    if (this.ws) {
      // Reject all pending requests
      for (const [, { reject, timer }] of this._pending) {
        clearTimeout(timer);
        reject(new Error("Disconnected"));
      }
      this._pending.clear();

      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { VmBridge };
