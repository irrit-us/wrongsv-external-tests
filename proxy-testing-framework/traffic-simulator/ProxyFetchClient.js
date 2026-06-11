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

const { SocksProxyAgent } = (() => {
  try { return require("socks-proxy-agent"); } catch (_) { return {}; }
})();
const { HttpsProxyAgent } = (() => {
  try { return require("https-proxy-agent"); } catch (_) { return {}; }
})();

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
    this._agent = null;
    this._lastTiming = null;
    this._requestCount = 0;

    if (this.proxyUrl) {
      this._agent = this._createAgent(this.proxyUrl);
    } else {
      // Direct mode: explicitly bypass any system-level proxy (e.g. 11451).
      // Node.js undici respects HTTP_PROXY/HTTPS_PROXY env vars by default.
      // We create an agent that forces direct connection.
      this._agent = this._createDirectAgent();
    }
  }

  /**
   * Create an agent that forces direct connection, bypassing system proxy.
   */
  _createDirectAgent() {
    // The "direct" agent is null for undici — but we also need to ensure
    // that system env vars HTTP_PROXY/HTTPS_PROXY don't interfere.
    // We do this by explicitly NOT setting a dispatcher.
    // However, if the system has HTTP_PROXY set, undici will use it.
    // The safest approach: unset proxy env vars for direct connections,
    // or use a dispatcher that bypasses.
    //
    // For Node 18+ built-in fetch, the cleanest approach is to use
    // a custom undici Agent that ignores proxy env vars.
    try {
      // Try to use undici Agent for direct connection
      const { Agent } = require("undici");
      return new Agent({
        connect: { rejectUnauthorized: false },
        // By not setting proxy, we force direct
      });
    } catch (_) {
      // undici not available; fall back to null (let fetch decide)
      // Save and clear proxy env vars during direct requests
      return null;
    }
  }

  /**
   * Create the appropriate proxy agent.
   */
  _createAgent(proxyUrl) {
    const url = proxyUrl.toLowerCase();
    if (url.startsWith("socks")) {
      if (!SocksProxyAgent) {
        throw new Error(
          "socks-proxy-agent package required for SOCKS proxy. Install: npm install socks-proxy-agent"
        );
      }
      return new SocksProxyAgent(proxyUrl);
    }
    if (url.startsWith("http")) {
      if (!HttpsProxyAgent) {
        throw new Error(
          "https-proxy-agent package required for HTTP proxy. Install: npm install https-proxy-agent"
        );
      }
      return new HttpsProxyAgent(proxyUrl);
    }
    throw new Error(`Unsupported proxy protocol: ${proxyUrl}`);
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

    const startTime = performance.now();
    const fetchInit = {
      method: init.method || "GET",
      headers: { ...this.defaultHeaders, ...(init.headers || {}) },
      body: init.body,
    };

    // Attach proxy agent
    if (this._agent) {
      fetchInit.dispatcher = this._agent;
    }

    // Apply timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    fetchInit.signal = controller.signal;

    try {
      const response = await fetch(url, fetchInit);
      clearTimeout(timeoutId);

      const ttfbTime = performance.now();
      const body = await response.text();
      const endTime = performance.now();

      this._requestCount++;
      this._lastTiming = {
        dns: -1, // undici fetch doesn't expose DNS timing separately
        connect: -1,
        tls: -1,
        ttfb: Math.round(ttfbTime - startTime),
        total: Math.round(endTime - startTime),
        status: response.status,
        bodySize: body.length,
        error: null,
      };

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body,
        timing: { ...this._lastTiming },
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const endTime = performance.now();
      this._lastTiming = {
        dns: -1,
        connect: -1,
        tls: -1,
        ttfb: -1,
        total: Math.round(endTime - startTime),
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
}

module.exports = { ProxyFetchClient };
