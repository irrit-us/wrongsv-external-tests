/**
 * ScreenshotTool — captures screenshots from a Puppeteer page on a schedule,
 * on navigation events, or on demand.
 *
 * Usage:
 *   const tool = new ScreenshotTool(page, { outputDir: './screenshots/' });
 *   tool.startInterval(2000);  // every 2 seconds
 *   await page.goto('https://example.com');
 *   await tool.screenshot('landing-page');
 *   tool.stop();
 */

const path = require("path");

class ScreenshotTool {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} options
   * @param {string} [options.outputDir]   - output directory (default: ./screenshots)
   * @param {'png'|'jpeg'} [options.format]  - image format
   * @param {number} [options.quality]     - JPEG quality (0–100)
   */
  constructor(page, options = {}) {
    this.page = page;
    this.outputDir = options.outputDir || "./screenshots";
    this.format = options.format || "png";
    this.quality = options.format === "jpeg" ? options.quality || 80 : undefined;
    this._intervalId = null;
    this._screenshots = [];
  }

  /**
   * Take a single screenshot and save to outputDir.
   *
   * @param {string} label     - file label (timestamp auto-prefixed)
   * @param {Object} [opts]   - puppeteer screenshot options (fullPage, clip, etc.)
   * @returns {Promise<string>} file path
   */
  async capture(label = "screenshot", opts = {}) {
    const fs = require("fs/promises");
    await fs.mkdir(this.outputDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}__${label}.${this.format}`;
    const filePath = path.join(this.outputDir, filename);

    const screenshotOpts = {
      type: this.format,
      fullPage: true,
      ...opts,
    };
    if (this.quality) screenshotOpts.quality = this.quality;

    await this.page.screenshot({ ...screenshotOpts, path: filePath });

    const record = { label, filePath, timestamp: new Date().toISOString() };
    this._screenshots.push(record);
    return filePath;
  }

  /**
   * Start capturing screenshots at a fixed interval.
   *
   * @param {number} intervalMs
   * @param {string} [labelPrefix] - label prefix (e.g. "auto")
   */
  startInterval(intervalMs, labelPrefix = "interval") {
    this.stop();
    let count = 0;
    this._intervalId = setInterval(async () => {
      try {
        await this.capture(`${labelPrefix}-${count++}`);
      } catch (e) {
        // Silently skip on navigation in progress
      }
    }, intervalMs);
  }

  /** Stop interval capture. */
  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /** Get all screenshot records for this session. */
  get records() {
    return [...this._screenshots];
  }

  /** Reset the records list. */
  clear() {
    this._screenshots = [];
  }
}

module.exports = { ScreenshotTool };
