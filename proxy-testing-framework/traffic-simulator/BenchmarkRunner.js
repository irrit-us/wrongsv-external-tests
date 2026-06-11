/**
 * BenchmarkRunner — orchestrates a traffic simulator benchmark session.
 *
 * Given a BehaviorProfile, proxy URL, and duration, it generates burst patterns,
 * executes fetch requests through the proxy, and collects detailed metrics.
 *
 * Usage:
 *   const runner = new BenchmarkRunner({
 *     proxy: 'socks5://127.0.0.1:1080',
 *     profile: 'web-browsing',
 *     duration: 30000,
 *   });
 *   const results = await runner.run();
 */

const { ProxyFetchClient } = require("./ProxyFetchClient");
const { BehaviorProfile } = require("./BehaviorProfile");
const { PatternGenerator } = require("./PatternGenerator");
const { MetricsCollector } = require("./MetricsCollector");

class BenchmarkRunner {
  /**
   * @param {Object} options
   * @param {string}       options.proxy         - proxy URL
   * @param {string|Object} options.profile      - profile name or config
   * @param {number}       [options.duration]     - test duration ms (default 30000)
   * @param {number}       [options.concurrency]  - override concurrency (default: from profile)
   * @param {number}       [options.maxRetries]   - per-request retries (default 0)
   * @param {boolean}      [options.verbose]      - emit progress events (default false)
   */
  constructor(options = {}) {
    this.proxy = options.proxy;
    this.profileConfig = options.profile;
    this.duration = options.duration || 30000;
    this.concurrencyOverride = options.concurrency || null;
    this.maxRetries = options.maxRetries || 0;
    this.verbose = options.verbose || false;
    this.baseUrl = options.baseUrl || null;
  }

  /**
   * Run the benchmark.
   * @returns {Promise<Object>} results { profile, proxy, durationMs, metrics, timeline }
   */
  async run() {
    const profile = BehaviorProfile.create(this.profileConfig, {
      baseUrl: this.baseUrl,
    });
    const concurrency = this.concurrencyOverride || profile.concurrency.max;
    const client = new ProxyFetchClient(this.proxy, {
      maxRetries: this.maxRetries,
      timeout: 15000,
      baseUrl: this.baseUrl,
    });
    const generator = new PatternGenerator(profile);
    const collector = new MetricsCollector();

    const startTime = Date.now();
    const bursts = generator.generateSession(this.duration);
    const timeline = [];

    if (this.verbose) {
      console.error(
        `[BenchmarkRunner] Profile: ${profile.name}, Duration: ${this.duration}ms, Concurrency: ${concurrency}, Bursts: ${bursts.length}`
      );
    }

    // Process bursts sequentially, but requests within a burst can be concurrent
    let requestIndex = 0;

    for (const burst of bursts) {
      const burstStart = Date.now();

      // Build fetch options for each request in this burst
      const fetchTasks = burst.requests.map((req) =>
        generator.buildFetchOptions(req.template, profile)
      );

      // Execute with concurrency limit
      const results = await this._executeBurst(
        client,
        fetchTasks,
        concurrency,
        burstStart
      );

      for (const result of results) {
        collector.record(result);
      }

      const burstEnd = Date.now();
      timeline.push({
        offsetMs: burst.startOffset,
        burstDurationMs: burstEnd - burstStart,
        requests: results.length,
        errors: results.filter((r) => r.error || r.status >= 400).length,
      });

      requestIndex += results.length;
    }

    const endTime = Date.now();
    const metrics = collector.compute();

    return {
      profile: profile.name,
      proxy: this.proxy,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
      concurrency,
      metrics,
      timeline,
    };
  }

  /**
   * Execute a burst of fetch tasks with a concurrency limit.
   */
  async _executeBurst(client, tasks, maxConcurrency, burstStart) {
    const results = [];

    // Simple async pool with concurrency limit
    const queue = [...tasks];
    const workers = [];

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        // Pre-delay (stagger requests slightly)
        if (task.delayMs > 0 && queue.length > 0) {
          const staggerDelay = Math.min(task.delayMs / maxConcurrency, 50);
          await new Promise((r) => setTimeout(r, staggerDelay));
        }

        try {
          const res = await client.fetch(task.url, task.init);
          results.push({
            ttfb: res.timing.ttfb,
            total: res.timing.total,
            status: res.status,
            bodySize: res.timing.bodySize || 0,
            error: null,
            url: task.url,
            method: task.init.method,
            timestamp: Date.now(),
          });
        } catch (err) {
          results.push({
            ttfb: -1,
            total: client.lastTiming?.total || -1,
            status: 0,
            bodySize: 0,
            error: err.message,
            url: task.url,
            method: task.init.method,
            timestamp: Date.now(),
          });
        }
      }
    };

    // Launch workers
    for (let i = 0; i < Math.min(maxConcurrency, tasks.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }
}

module.exports = { BenchmarkRunner };
