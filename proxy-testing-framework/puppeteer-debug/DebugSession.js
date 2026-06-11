/**
 * DebugSession — unified orchestrator for a Puppeteer proxy test session.
 *
 * Combines ProxyBrowser, NetworkRecorder, HARCollector, ScreenshotTool,
 * and ConsoleCapture into a single high-level API.
 *
 * Usage:
 *   const session = new DebugSession({
 *     proxy: 'socks5://127.0.0.1:1080',
 *     targets: ['https://example.com', 'https://httpbin.org/ip'],
 *     outputDir: './results/',
 *   });
 *   const report = await session.run();
 */

const { ProxyBrowser } = require("./ProxyBrowser");
const { NetworkRecorder } = require("./NetworkRecorder");
const { HARCollector } = require("./HARCollector");
const { ScreenshotTool } = require("./ScreenshotTool");
const { ConsoleCapture } = require("./ConsoleCapture");

class DebugSession {
  /**
   * @param {Object} options
   * @param {string}   options.proxy           - proxy URL
   * @param {string[]} options.targets          - URLs to navigate
   * @param {string}   [options.outputDir]      - output directory (default: ./debug-results)
   * @param {boolean}  [options.headless]       - default true
   * @param {boolean}  [options.captureHar]     - generate HAR file (default true)
   * @param {Object}   [options.screenshots]    - { interval: number } or false to disable
   * @param {Object}   [options.puppeteerOpts]  - additional puppeteer launch options
   * @param {number}   [options.navigationTimeout] - per-target timeout ms (default 30000)
   * @param {number}   [options.waitAfterNavigation] - ms to wait after page load (default 2000)
   */
  constructor(options = {}) {
    this.proxy = options.proxy;
    this.targets = options.targets || ["https://example.com"];
    this.outputDir = options.outputDir || "./debug-results";
    this.headless = options.headless !== false;
    this.captureHar = options.captureHar !== false;
    this.screenshotInterval =
      options.screenshots && options.screenshots.interval
        ? options.screenshots.interval
        : null;
    this.puppeteerOpts = options.puppeteerOpts || {};
    this.navigationTimeout = options.navigationTimeout || 30000;
    this.waitAfterNavigation = options.waitAfterNavigation || 2000;
    this.browser = null;
    this.page = null;
  }

  /**
   * Run the full debug session against all targets.
   * @returns {Promise<Object>} report
   */
  async run() {
    const startTime = Date.now();
    const fs = require("fs/promises");
    await fs.mkdir(this.outputDir, { recursive: true });

    // Launch
    const { browser, page } = await ProxyBrowser.launchWithPage({
      proxy: this.proxy,
      headless: this.headless,
      extraArgs: this.puppeteerOpts.args || [],
    });
    this.browser = browser;
    this.page = page;

    // Set up instrumentation
    const recorder = new NetworkRecorder(page);
    const consoleCapture = new ConsoleCapture(page);
    const screenshotTool = new ScreenshotTool(page, {
      outputDir: `${this.outputDir}/screenshots`,
    });

    recorder.start();
    consoleCapture.start();
    if (this.screenshotInterval) {
      screenshotTool.startInterval(this.screenshotInterval);
    }

    const targetResults = [];
    const allNetworkEvents = [];

    try {
      for (const targetUrl of this.targets) {
        const navStart = Date.now();

        try {
          await page.goto(targetUrl, {
            waitUntil: "networkidle2",
            timeout: this.navigationTimeout,
          });

          // Allow page to settle
          await new Promise((r) => setTimeout(r, this.waitAfterNavigation));

          const navEnd = Date.now();

          // Collect network events for this target
          const events = recorder.stop();
          allNetworkEvents.push(...events);

          // Take a post-navigation screenshot
          let screenshotPath = null;
          try {
            const label = targetUrl.replace(/https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "_");
            screenshotPath = await screenshotTool.capture(label);
          } catch (_) {}

          targetResults.push({
            url: targetUrl,
            navigationTimeMs: navEnd - navStart,
            status: "success",
            screenshot: screenshotPath,
            networkSummary: recorder.summarize(events),
          });
        } catch (navError) {
          targetResults.push({
            url: targetUrl,
            status: "failed",
            error: navError.message,
          });
        }

        // Restart recorder for next target
        recorder.clear();
        recorder.start();
      }

      // Final snapshot: current page
      try {
        await screenshotTool.capture("final");
      } catch (_) {}
    } finally {
      screenshotTool.stop();
    }

    const consoleLogs = consoleCapture.stop();
    const networkEvents = allNetworkEvents;
    recorder.stop(); // ensure clean

    // Build HAR
    let har = null;
    if (this.captureHar && networkEvents.length > 0) {
      har = HARCollector.build(networkEvents, {
        proxy: this.proxy,
        browser: "Puppeteer",
        startTime,
      });
      await HARCollector.writeFile(
        har,
        `${this.outputDir}/session.har`
      );
    }

    const sessionEnd = Date.now();

    const report = {
      sessionDurationMs: sessionEnd - startTime,
      proxy: this.proxy,
      targets: targetResults,
      networkSummary: {
        totalRequests: networkEvents.length,
        totalErrors: networkEvents.filter((e) => e.error).length,
        totalBytes:
          networkEvents.reduce(
            (sum, e) => sum + (e.encodedBodySize || e.bodySize || 0),
            0
          ),
      },
      screenshots: screenshotTool.records,
      consoleLogs: {
        total: consoleLogs.length,
        errors: consoleLogs.filter((l) => l.type === "error").length,
        warnings: consoleLogs.filter((l) => l.type === "warning").length,
        entries: consoleLogs,
      },
      harPath: har ? `${this.outputDir}/session.har` : null,
      outputDir: this.outputDir,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(sessionEnd).toISOString(),
    };

    return report;
  }

  /** Clean up browser resources. */
  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {}
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { DebugSession };
