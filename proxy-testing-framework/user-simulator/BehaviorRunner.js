/**
 * BehaviorRunner — Executes user-behavior action sequences on a Puppeteer page.
 *
 * Action types:
 *   navigate   — page.goto(url, { waitUntil })
 *   scroll     — window.scrollBy(0, distance)
 *   click      — page.click(selector)
 *   type       — page.type(selector, text, { delay })
 *   wait       — setTimeout(ms)
 *   hover      — page.hover(selector)
 *   evaluate   — page.evaluate(code)
 *
 * Each action is timed. Results include per-action timing and errors.
 */

class BehaviorRunner {
  /**
   * @param {import('puppeteer').Page} page
   * @param {Object} [options]
   * @param {number} [options.defaultTimeout=30000] - per-action timeout
   * @param {number} [options.typeDelay=30] - ms between keystrokes for type actions
   * @param {boolean} [options.verbose=false]
   */
  constructor(page, options = {}) {
    this.page = page;
    this.defaultTimeout = options.defaultTimeout || 30000;
    this.typeDelay = options.typeDelay || 30;
    this.verbose = options.verbose || false;

    /** @type {Array<{action: Object, timing: Object, error?: string}>} */
    this.results = [];
    this._startTime = null;
    this._endTime = null;
  }

  /**
   * Execute an array of actions sequentially.
   * @param {Array<{type: string, [key:string]: any}>} actions
   * @returns {Promise<Array>} per-action results with timing
   */
  async execute(actions) {
    this._startTime = Date.now();
    this.results = [];

    for (const action of actions) {
      const result = await this._executeOne(action);
      this.results.push(result);

      if (result.error && this.verbose) {
        console.error(
          `[BehaviorRunner] ${action.type}:${action.label || "?"} — ${result.error}`
        );
      }
    }

    this._endTime = Date.now();
    return this.results;
  }

  /**
   * Execute a single action.
   */
  async _executeOne(action) {
    const t0 = Date.now();
    try {
      switch (action.type) {
        case "navigate":
          await this._navigate(action);
          break;
        case "scroll":
          await this._scroll(action);
          break;
        case "click":
          await this._click(action);
          break;
        case "type":
          await this._type(action);
          break;
        case "wait":
          await this._wait(action);
          break;
        case "hover":
          await this._hover(action);
          break;
        case "evaluate":
          await this._evaluate(action);
          break;
        default:
          return {
            action,
            timing: { elapsed: Date.now() - t0 },
            error: `Unknown action type: ${action.type}`,
          };
      }

      return {
        action,
        timing: { elapsed: Date.now() - t0 },
      };
    } catch (err) {
      return {
        action,
        timing: { elapsed: Date.now() - t0 },
        error: err.message,
      };
    }
  }

  async _navigate(action) {
    await this.page.goto(action.url, {
      waitUntil: action.waitUntil || "load",
      timeout: action.timeout || this.defaultTimeout,
    });
  }

  async _scroll(action) {
    await this.page.evaluate((distance) => {
      window.scrollBy({ top: distance, behavior: "smooth" });
    }, action.distance || 300);
  }

  async _click(action) {
    await this.page.waitForSelector(action.selector, {
      timeout: action.timeout || this.defaultTimeout,
    });
    await this.page.click(action.selector);
  }

  async _type(action) {
    await this.page.waitForSelector(action.selector, {
      timeout: action.timeout || this.defaultTimeout,
    });
    await this.page.click(action.selector); // focus
    await this.page.type(action.selector, action.text, {
      delay: action.delay || this.typeDelay,
    });
  }

  async _wait(action) {
    await new Promise((r) => setTimeout(r, action.ms || 1000));
  }

  async _hover(action) {
    await this.page.waitForSelector(action.selector, {
      timeout: action.timeout || this.defaultTimeout,
    });
    await this.page.hover(action.selector);
  }

  async _evaluate(action) {
    await this.page.evaluate(action.code);
  }

  /**
   * Summary of the executed session.
   */
  summary() {
    const total = this.results.length;
    const errors = this.results.filter((r) => r.error);
    const elapsed =
      (this._endTime || Date.now()) - (this._startTime || Date.now());

    const byType = {};
    for (const r of this.results) {
      const t = r.action.type;
      if (!byType[t]) byType[t] = { count: 0, errors: 0, totalMs: 0 };
      byType[t].count++;
      if (r.error) byType[t].errors++;
      byType[t].totalMs += r.timing.elapsed;
    }

    // Average timing per action type
    for (const t of Object.keys(byType)) {
      byType[t].avgMs = Math.round(byType[t].totalMs / byType[t].count);
    }

    return {
      totalActions: total,
      errors: errors.length,
      errorRate: total > 0 ? (errors.length / total).toFixed(3) : 0,
      elapsedMs: elapsed,
      byType,
    };
  }
}

module.exports = { BehaviorRunner };
