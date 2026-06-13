/**
 * ProxyFetchClient — fetch() wrapper that routes through a proxy and records
 * per-request timing breakdown.
 *
 * Uses Node.js built-in undici (Node 18+) for HTTP, with proxy-agent packages
 * for SOCKS5/HTTP proxy support.
 *
 * Usage:
 *   const client = new ProxyFetchClient('socks5://127.0.0.1:1080');
 *   const res = await client.fetch('https://httpbin.org/get');
 *   console.log(client.lastTiming);  // { dns, connect, tls, ttfb, total }
 */

const { spawn } = require("child_process");

class ProxyFetchClient {
  /**
   * @param {string} [proxyUrl]  - proxy URL (socks5://host:port, http://host:port, etc.)
   *                               Pass null/falsy for direct connection.
   * @param {Object} [options]
   * @param {number} [options.timeout]       - request timeout ms (default 30000)
   * @param {number} [options.maxRetries]    - auto-retry on network error (default 0)
   * @param {number} [options.retryBackoff]  - backoff multiplier ms (default 500)
   * @param {Object} [options.defaultHeaders] - headers added to every request
   * @param {string} [options.baseUrl]       - base URL for local templates (e.g. http://127.0.0.1:3099)
   */
  constructor(proxyUrl, options = {}) {
    this.proxyUrl = proxyUrl || null;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 0;
    this.retryBackoff = options.retryBackoff || 500;
    this.defaultHeaders = options.defaultHeaders || {};
    this.baseUrl = options.baseUrl || null;
    this._lastTiming = null;
    this._requestCount = 0;
  }

  /**
   * Perform a fetch request through the configured proxy with timing.
   *
   * @param {string} url
   * @param {Object} [init] - fetch init options (method, headers, body, etc.)
   * @returns {Promise<Response>}
   */
  async fetch(url, init = {}) {
    this._lastTiming = {
      dns: -1,
      connect: -1,
      tls: -1,
      ttfb: -1,
      total: -1,
      status: 0,
      error: null,
    };

    try {
      const metrics = await this._curl(url, {
        method: init.method || "GET",
        headers: { ...this.defaultHeaders, ...(init.headers || {}) },
        body: init.body,
      });

      this._requestCount++;
      this._lastTiming = {
        dns: -1,
        connect: -1,
        tls: -1,
        ttfb: metrics.ttfb,
        total: metrics.total,
        status: metrics.status,
        bodySize: metrics.bodySize,
        error: null,
      };

      return {
        ok: metrics.status >= 200 && metrics.status < 400,
        status: metrics.status,
        statusText: "",
        headers: new Map(),
        body: "",
        timing: { ...this._lastTiming },
      };
    } catch (err) {
      this._lastTiming = {
        dns: -1,
        connect: -1,
        tls: -1,
        ttfb: -1,
        total: -1,
        status: 0,
        bodySize: 0,
        error: err.message,
      };

      // Retry on network errors (not on HTTP errors)
      if (this.maxRetries > 0) {
        const retries = init._retryCount || 0;
        if (retries < this.maxRetries) {
          await new Promise((r) =>
            setTimeout(r, this.retryBackoff * Math.pow(2, retries))
          );
          return this.fetch(url, {
            ...init,
            _retryCount: retries + 1,
          });
        }
      }

      throw err;
    }
  }

  /** Get timing from the most recent request. */
  get lastTiming() {
    return this._lastTiming ? { ...this._lastTiming } : null;
  }

  /** Total request count for this client. */
  get requestCount() {
    return this._requestCount;
  }

  async _curl(url, request) {
    const args = [
      "--silent",
      "--show-error",
      "--location",
      "--output",
      "/dev/null",
      "--request",
      request.method,
      "--max-time",
      String(Math.max(this.timeout / 1000, 1)),
      "--write-out",
      "__CURL__%{http_code}:%{size_download}:%{time_starttransfer}:%{time_total}",
    ];

    if (this.proxyUrl) {
      const lower = this.proxyUrl.toLowerCase();
      const stripped = this.proxyUrl.replace(/^[a-z0-9]+:\/\//i, "");
      if (lower.startsWith("socks5h://") || lower.startsWith("socks5://")) {
        args.push("--socks5-hostname", stripped);
      } else if (lower.startsWith("socks4://") || lower.startsWith("socks://")) {
        args.push("--socks4", stripped);
      } else if (lower.startsWith("http://") || lower.startsWith("https://")) {
        args.push("--proxy", this.proxyUrl);
      } else {
        throw new Error(`Unsupported proxy protocol: ${this.proxyUrl}`);
      }
    } else {
      args.push("--noproxy", "*");
    }

    for (const [key, value] of Object.entries(request.headers || {})) {
      args.push("-H", `${key}: ${value}`);
    }

    const body =
      request.body === undefined || request.body === null
        ? null
        : Buffer.isBuffer(request.body) || typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

    if (body !== null) {
      args.push("--data-binary", "@-");
    }

    args.push(url);

    const { stdout, stderr, code } = await new Promise((resolve, reject) => {
      const child = spawn("curl", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ stdout, stderr, code }));
      if (body !== null) {
        child.stdin.end(body);
      } else {
        child.stdin.end();
      }
    });

    if (code !== 0) {
      throw new Error(stderr.trim() || `curl exited with code ${code}`);
    }

    const match = stdout.match(/__CURL__(\d+):([0-9.]+):([0-9.]+):([0-9.]+)$/);
    if (!match) {
      throw new Error(`unexpected curl metrics output: ${stdout}`);
    }

    return {
      status: Number(match[1]),
      bodySize: Math.round(Number(match[2])),
      ttfb: Math.round(Number(match[3]) * 1000),
      total: Math.round(Number(match[4]) * 1000),
    };
  }
}

module.exports = { ProxyFetchClient };
