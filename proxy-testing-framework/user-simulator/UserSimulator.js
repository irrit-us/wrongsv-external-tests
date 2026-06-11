/**
 * UserSimulator — Puppeteer-based real user behavior simulation through proxy.
 *
 * Drives a headless browser through realistic user journeys (page loads,
 * scrolling, clicking, typing, media loading) while routing all traffic
 * through a configurable SOCKS/HTTP(S) proxy.
 *
 * Usage:
 *   const sim = new UserSimulator({
 *     proxy: 'socks5://127.0.0.1:7890',
 *     behavior: 'web-browsing',
 *     duration: 30000,
 *   });
 *   const report = await sim.run();
 *   // report.summary, report.actions, report.networkEvents
 *   await sim.close();
 */

const puppeteer = require("puppeteer");
const { buildLaunchOptions } = require("./utils/proxy");
const { BehaviorRunner } = require("./BehaviorRunner");
const behaviors = require("./behaviors");

class UserSimulator {
  /**
   * @param {Object} options
   * @param {string} options.proxy - proxy URL (e.g. socks5://127.0.0.1:7890)
   * @param {string} options.behavior - behavior name (web-browsing, video-streaming, etc.)
   * @param {number} [options.duration=30000] - target simulation duration in ms
   * @param {boolean} [options.headless=true] - run browser headless
   * @param {string[]} [options.urls] - override target URLs for the behavior
   * @param {Object} [options.puppeteerOpts] - extra Puppeteer launch options
   * @param {boolean} [options.recordNetwork=false] - capture full request/response data
   * @param {boolean} [options.verbose=false] - log actions to stderr
   */
  constructor(options = {}) {
    if (!options.proxy) throw new Error("options.proxy is required");

    this.proxy = options.proxy;
    this.behaviorName = options.behavior || "web-browsing";
    this.duration = options.duration || 30000;
    this.headless = options.headless !== false;
    this.urls = options.urls || null;
    this.puppeteerOpts = options.puppeteerOpts || {};
    this.recordNetwork = options.recordNetwork || false;
    this.verbose = options.verbose || false;

    // Resolve behavior
    this.behaviorDef = behaviors.get(this.behaviorName);
    if (!this.behaviorDef) {
      const available = behaviors
        .list()
        .map((b) => b.name)
        .join(", ");
      throw new Error(
        `Unknown behavior "${this.behaviorName}". Available: ${available}`
      );
    }

    /** @type {import('puppeteer').Browser|null} */
    this.browser = null;
    /** @type {import('puppeteer').Page|null} */
    this.page = null;
    /** @type {BehaviorRunner|null} */
    this.runner = null;

    // Network recording
    this._networkEvents = [];
    this._networkListener = null;
  }

  /**
   * Run the simulation. Launches browser, generates and executes actions,
   * returns structured report.
   *
   * @returns {Promise<Object>} { behavior, proxy, duration, summary, actions, networkEvents }
   */
  async run() {
    if (this.verbose) {
      process.stderr.write(
        `[UserSimulator] Starting "${this.behaviorName}" via ${this.proxy} (${this.duration}ms)\n`
      );
    }

    // 1. Launch browser
    const launchOpts = buildLaunchOptions({
      proxy: this.proxy,
      headless: this.headless,
    });
    Object.assign(launchOpts, this.puppeteerOpts);

    this.browser = await puppeteer.launch(launchOpts);
    this.page = await this.browser.newPage();

    // If proxy has credentials, authenticate
    const { parseProxyUrl } = require("./utils/proxy");
    const parsed = parseProxyUrl(this.proxy);
    if (parsed && parsed.username) {
      await this.page.authenticate({
        username: parsed.username,
        password: parsed.password || "",
      });
    }

    // 2. Network recording (optional)
    if (this.recordNetwork) {
      this._startNetworkRecording();
    }

    // 3. Generate action sequence
    const actions = this.behaviorDef.generateSession({
      duration: this.duration,
      urls: this.urls,
    });

    if (this.verbose) {
      process.stderr.write(`[UserSimulator] ${actions.length} actions generated\n`);
    }

    // 4. Execute
    this.runner = new BehaviorRunner(this.page, { verbose: this.verbose });
    const actionResults = await this.runner.execute(actions);

    // 5. Stop network recording
    let networkEvents = [];
    if (this.recordNetwork) {
      networkEvents = this._stopNetworkRecording();
    }

    // 6. Build report
    const summary = this.runner.summary();
    const navTiming = await this._getNavigationTiming();

    const report = {
      behavior: this.behaviorName,
      proxy: this.proxy,
      duration: this.duration,
      summary: {
        ...summary,
        navigationTiming: navTiming,
        totalRequests: networkEvents.length,
        failedRequests: networkEvents.filter(
          (e) => e.status >= 400 || e.error
        ).length,
      },
      actions: actionResults,
      networkEvents: networkEvents.slice(0, 500), // cap to prevent bloat
    };

    if (this.verbose) {
      const ok = actionResults.filter((r) => !r.error).length;
      process.stderr.write(
        `[UserSimulator] Complete: ${ok}/${actionResults.length} actions OK, ` +
          `${summary.errors} errors, ${summary.elapsedMs}ms elapsed\n`
      );
    }

    return report;
  }

  /**
   * Close browser and clean up.
   */
  async close() {
    if (this.page) {
      try { await this.page.close(); } catch (_) {}
      this.page = null;
    }
    if (this.browser) {
      try { await this.browser.close(); } catch (_) {}
      this.browser = null;
    }
    this.runner = null;
  }

  // ---- Network recording ----

  _startNetworkRecording() {
    this._networkEvents = [];

    const onRequest = (req) => {
      this._networkEvents.push({
        phase: "request",
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        timestamp: Date.now(),
      });
    };

    const onResponse = (res) => {
      const existing = this._networkEvents.find(
        (e) => e.phase === "request" && e.url === res.url()
      );
      const entry = {
        phase: "response",
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        timestamp: Date.now(),
      };
      // Try to get headers
      try {
        entry.headers = res.headers();
      } catch (_) {}
      this._networkEvents.push(entry);
    };

    const onFailed = (req) => {
      this._networkEvents.push({
        phase: "failed",
        url: req.url(),
        error: req.failure()?.errorText || "unknown",
        timestamp: Date.now(),
      });
    };

    this.page.on("request", onRequest);
    this.page.on("response", onResponse);
    this.page.on("requestfailed", onFailed);

    this._networkListener = { onRequest, onResponse, onFailed };
  }

  _stopNetworkRecording() {
    if (this._networkListener && this.page) {
      this.page.off("request", this._networkListener.onRequest);
      this.page.off("response", this._networkListener.onResponse);
      this.page.off("requestfailed", this._networkListener.onFailed);
      this._networkListener = null;
    }
    return this._networkEvents;
  }

  async _getNavigationTiming() {
    if (!this.page) return null;
    try {
      return await this.page.evaluate(() => {
        const t = performance.getEntriesByType("navigation")[0];
        if (!t) return null;
        return {
          dns: t.domainLookupEnd - t.domainLookupStart,
          connect: t.connectEnd - t.connectStart,
          tls: t.secureConnectionStart > 0
            ? t.connectEnd - t.secureConnectionStart
            : 0,
          ttfb: t.responseStart - t.requestStart,
          domInteractive: t.domInteractive - t.requestStart,
          domComplete: t.domComplete - t.requestStart,
          total: t.duration,
        };
      });
    } catch (_) {
      return null;
    }
  }
}

module.exports = { UserSimulator };
