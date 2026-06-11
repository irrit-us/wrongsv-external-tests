/**
 * HARCollector — Generates HAR 1.2 files from NetworkRecorder events.
 *
 * HAR files can be opened in Chrome DevTools or httparchive.org viewers
 * for visual inspection of network activity through the proxy.
 */

class HARCollector {
  /**
   * Build a HAR 1.2-compliant object from NetworkRecorder events.
   *
   * @param {Object[]} networkEvents — from NetworkRecorder.stop()
   * @param {Object}   [meta]
   * @param {string}   [meta.browser]      - browser name/version
   * @param {string}   [meta.proxy]        - proxy URL used
   * @param {number}   [meta.startTime]    - session start ms epoch
   * @returns {Object} HAR log
   */
  static build(networkEvents, meta = {}) {
    const startTime = meta.startTime || Date.now();
    const entries = networkEvents.map((event, idx) =>
      HARCollector._buildEntry(event, startTime, idx)
    );

    return {
      log: {
        version: "1.2",
        creator: {
          name: "proxy-testing-framework",
          version: "1.0.0",
        },
        browser: {
          name: meta.browser || "Puppeteer",
          version: meta.browserVersion || "unknown",
        },
        pages: [
          {
            id: "page_1",
            title: "Proxy Test Session",
            startedDateTime: new Date(startTime).toISOString(),
            pageTimings: { onContentLoad: -1, onLoad: -1 },
          },
        ],
        entries,
        comment: meta.proxy
          ? `Captured through proxy: ${meta.proxy}`
          : undefined,
      },
    };
  }

  /**
   * Build a single HAR entry from a network event.
   */
  static _buildEntry(event, baseTime, index) {
    const startOffset = event.timing.requestStart
      ? event.timing.requestStart - baseTime
      : 0;

    const timing = {
      blocked: 0,
      dns: -1,
      connect: -1,
      send: 0,
      wait:
        event.timing.responseReceived && event.timing.requestStart
          ? event.timing.responseReceived - event.timing.requestStart
          : 0,
      receive: event.endTime
        ? event.endTime -
          (event.timing.responseReceived || event.timing.requestStart || 0)
        : 0,
      ssl: -1,
      comment: "",
    };

    return {
      pageref: "page_1",
      startedDateTime: new Date(event.timing.requestStart || baseTime).toISOString(),
      time: event.endTime ? event.endTime - (event.timing.requestStart || event.endTime) : 0,
      request: {
        method: event.method || "GET",
        url: event.url,
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: HARCollector._formatHeaders(event.requestHeaders || {}),
        queryString: HARCollector._parseQueryString(event.url),
        postData: event.postData
          ? { mimeType: "application/octet-stream", text: event.postData }
          : undefined,
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: event.status || 0,
        statusText: event.statusText || "",
        httpVersion: "HTTP/1.1",
        cookies: [],
        headers: HARCollector._formatHeaders(event.responseHeaders || {}),
        content: {
          size: event.encodedBodySize || event.bodySize || 0,
          mimeType: event.responseHeaders?.["content-type"] || "application/octet-stream",
        },
        redirectURL: "",
        headersSize: -1,
        bodySize: event.encodedBodySize || event.bodySize || -1,
      },
      cache: {},
      timings: timing,
      _index: index,
      _error: event.error || null,
    };
  }

  static _formatHeaders(headers) {
    return Object.entries(headers).map(([name, value]) => ({
      name,
      value: String(value),
    }));
  }

  static _parseQueryString(url) {
    try {
      const u = new URL(url);
      return [...u.searchParams.entries()].map(([name, value]) => ({
        name,
        value,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Write a HAR object to file as JSON.
   *
   * @param {Object} har       - HAR log (from build())
   * @param {string} filePath  - output file path
   */
  static async writeFile(har, filePath) {
    const fs = require("fs/promises");
    const json = JSON.stringify(har, null, 2);
    await fs.writeFile(filePath, json, "utf-8");
    return filePath;
  }
}

module.exports = { HARCollector };
