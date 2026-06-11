/**
 * ConsoleCapture — collects browser console messages with levels and source info.
 *
 * Usage:
 *   const capture = new ConsoleCapture(page);
 *   capture.start();
 *   await page.goto('https://example.com');
 *   const logs = capture.stop();
 *   // logs = [{ type: 'error', text: '...', location: '...js:42', timestamp: 1700000000 }]
 */

class ConsoleCapture {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} [options]
   * @param {string[]} [options.levels] - only capture these levels (log, warn, error, info, debug)
   */
  constructor(page, options = {}) {
    this.page = page;
    this.levels = options.levels || null; // null = all
    this._logs = [];
    this._started = false;
  }

  /** Start capturing. */
  start() {
    if (this._started) {
      this._logs = [];
    }
    this._started = true;

    this._handler = (msg) => {
      const type = msg.type(); // log, warn, error, info, debug, etc.
      if (this.levels && !this.levels.includes(type)) return;

      const entry = {
        type,
        text: msg.text(),
        location: msg.location()?.url
          ? `${msg.location().url}:${msg.location().lineNumber || "?"}`
          : "unknown",
        timestamp: Date.now(),
        args: [],
      };

      // Collect JSHandle args (best-effort, may fail if execution context destroyed)
      try {
        const args = msg.args();
        for (const arg of args) {
          try {
            entry.args.push(arg._remoteObject?.value ?? String(arg));
          } catch (_) {
            entry.args.push("(unserializable)");
          }
        }
      } catch (_) {}

      this._logs.push(entry);
    };

    this.page.on("console", this._handler);
  }

  /** Stop capturing and return logs. */
  stop() {
    if (!this._started) return [];
    this.page.off("console", this._handler);
    this._started = false;
    return [...this._logs];
  }

  /** Get current logs without stopping. */
  get logs() {
    return [...this._logs];
  }

  /** Get logs filtered by level. */
  byLevel(level) {
    return this._logs.filter((l) => l.type === level);
  }

  /** Get error count. */
  get errorCount() {
    return this._logs.filter(
      (l) => l.type === "error" || l.type === "warning"
    ).length;
  }

  clear() {
    this._logs = [];
  }
}

module.exports = { ConsoleCapture };
