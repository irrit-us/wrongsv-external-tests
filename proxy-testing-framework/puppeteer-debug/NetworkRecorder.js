/**
 * NetworkRecorder — captures all HTTP requests/responses for a Puppeteer page
 * with detailed timing information.
 *
 * Usage:
 *   const recorder = new NetworkRecorder(page);
 *   recorder.start();
 *   await page.goto('https://example.com');
 *   await page.waitForNetworkIdle();
 *   const events = recorder.stop();
 */

const { EventEmitter } = require("events");

class NetworkRecorder extends EventEmitter {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} [options]
   * @param {RegExp|string} [options.urlFilter]   - only record matching URLs
   * @param {string[]}     [options.resourceTypes] - only record these types (document, xhr, script, etc.)
   */
  constructor(page, options = {}) {
    super();
    this.page = page;
    this.urlFilter = options.urlFilter || null;
    this.resourceTypes = options.resourceTypes || null;
    this._events = [];
    this._pending = new Map(); // requestId → event
    this._started = false;
  }

  /** Start recording. Safe to call multiple times — resets if already started. */
  start() {
    if (this._started) {
      this._events = [];
      this._pending.clear();
      this._unbind();
    }
    this._started = true;

    this._onRequest = (req) => {
      // Filter
      if (this.urlFilter && !req.url().match(this.urlFilter)) return;
      if (
        this.resourceTypes &&
        !this.resourceTypes.includes(req.resourceType())
      )
        return;

      const event = {
        requestId: req._requestId || `${Date.now()}-${Math.random()}`,
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        requestHeaders: req.headers(),
        postData: req.postData() || undefined,
        startTime: Date.now(),
        timing: { requestStart: Date.now() },
        status: null,
        statusText: null,
        responseHeaders: null,
        bodySize: 0,
        encodedBodySize: 0,
        error: null,
      };
      this._pending.set(event.requestId, event);
      this.emit("request", event);
    };

    this._onResponse = (res) => {
      const req = res.request();
      const event = this._pending.get(req._requestId);
      if (!event) return;

      event.status = res.status();
      event.statusText = res.statusText();
      event.responseHeaders = res.headers();
      event.timing.responseReceived = Date.now();
      event.endTime = Date.now();
      event.timing.responseEnd = event.endTime;

      // Safely try to get body size from headers
      try {
        const cl = res.headers()["content-length"];
        if (cl) event.bodySize = parseInt(cl, 10);
      } catch (_) {}

      // Try encoded body size from security details
      try {
        const sd = res.securityDetails();
        if (sd) event.encodedBodySize = sd.subjectName ? 0 : 0;
      } catch (_) {}

      this.emit("response", event);
    };

    this._onRequestFailed = (req) => {
      const event = this._pending.get(req._requestId);
      if (!event) return;
      event.error = req.failure()?.errorText || "requestFailed";
      event.timing.errorTime = Date.now();
      event.endTime = Date.now();
      this.emit("requestFailed", event);
    };

    this._onRequestFinished = (req) => {
      const event = this._pending.get(req._requestId);
      if (!event) return;

      event.endTime = Date.now();
      event.timing.requestFinished = event.endTime;

      try {
        event.response = req.response();
        if (event.response) {
          event.encodedBodySize =
            event.response.encodedBodyLength?.() || 0;
          event.timing.responseEnd =
            event.timing.responseEnd || event.endTime;
        }
      } catch (_) {}

      // Move from pending to completed
      this._pending.delete(req._requestId);
      this._events.push(event);
      this.emit("requestFinished", event);
    };

    this.page.on("request", this._onRequest);
    this.page.on("response", this._onResponse);
    this.page.on("requestfailed", this._onRequestFailed);
    this.page.on("requestfinished", this._onRequestFinished);
  }

  /** Stop recording and return all captured events. */
  stop() {
    if (!this._started) return [];
    this._unbind();
    this._started = false;
    // Include any pending events (no response yet)
    return [...this._events, ...this._pending.values()];
  }

  /** Clear recorded data without unbinding. */
  clear() {
    this._events = [];
    this._pending.clear();
  }

  _unbind() {
    if (this._onRequest) {
      this.page.off("request", this._onRequest);
      this.page.off("response", this._onResponse);
      this.page.off("requestfailed", this._onRequestFailed);
      this.page.off("requestfinished", this._onRequestFinished);
    }
  }

  /**
   * Get a summary of recorded events.
   * @returns {{ total: number, byStatus: Record<number, number>, byType: Record<string, number>, totalBytes: number }}
   */
  summarize(events) {
    const data = events || this._events.concat([...this._pending.values()]);
    const summary = {
      total: data.length,
      byStatus: {},
      byType: {},
      totalBytes: 0,
      errors: 0,
    };
    for (const e of data) {
      const s = e.status || 0;
      summary.byStatus[s] = (summary.byStatus[s] || 0) + 1;
      summary.byType[e.resourceType] =
        (summary.byType[e.resourceType] || 0) + 1;
      summary.totalBytes += e.encodedBodySize || e.bodySize || 0;
      if (e.error) summary.errors++;
    }
    return summary;
  }
}

module.exports = { NetworkRecorder };
