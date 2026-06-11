/**
 * MetricsCollector — aggregates per-request timing data into statistical
 * distributions for latency, throughput, and error analysis.
 *
 * Usage:
 *   const collector = new MetricsCollector();
 *   collector.record({ ttfb: 150, total: 320, status: 200, bodySize: 1024 });
 *   collector.record({ ttfb: 180, total: 400, status: 200, bodySize: 2048 });
 *   const stats = collector.compute();
 */

class MetricsCollector {
  constructor() {
    this._samples = [];
    this._startTime = null;
    this._endTime = null;
  }

  /** Record a single request timing. */
  record(timing) {
    if (!this._startTime) this._startTime = Date.now();
    this._endTime = Date.now();
    this._samples.push({
      ttfb: timing.ttfb || -1,
      total: timing.total || -1,
      status: timing.status || 0,
      bodySize: timing.bodySize || 0,
      error: timing.error || null,
      timestamp: Date.now(),
    });
  }

  /** Bulk record. */
  recordMany(timings) {
    for (const t of timings) this.record(t);
  }

  /** Get sample count. */
  get count() {
    return this._samples.length;
  }

  /** Compute percentile from sorted array. */
  static _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Compute aggregated statistics.
   *
   * @returns {Object} stats
   */
  compute() {
    const samples = this._samples;
    if (samples.length === 0) {
      return {
        totalRequests: 0,
        durationMs: 0,
        throughput: { requestsPerSec: 0, bytesPerSec: 0 },
        latency: { min: 0, max: 0, avg: 0, median: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
        ttfb: { min: 0, max: 0, avg: 0, median: 0 },
        errors: { total: 0, rate: 0, byType: {} },
        statusCodes: {},
      };
    }

    const durationMs = (this._endTime || Date.now()) - (this._startTime || Date.now());
    const durationSec = Math.max(durationMs / 1000, 0.001);

    // Latency: total response time (only successful >=200 <400)
    const successLatencies = samples
      .filter((s) => s.total > 0 && s.status >= 200 && s.status < 400)
      .map((s) => s.total)
      .sort((a, b) => a - b);

    // TTFB
    const successTtfbs = samples
      .filter((s) => s.ttfb > 0 && s.status >= 200 && s.status < 400)
      .map((s) => s.ttfb)
      .sort((a, b) => a - b);

    // Errors
    const errors = samples.filter((s) => s.error || s.status >= 400);
    const errorByType = {};
    for (const e of errors) {
      const type = e.error || `HTTP_${e.status}`;
      errorByType[type] = (errorByType[type] || 0) + 1;
    }

    // Status codes
    const statusCodes = {};
    for (const s of samples) {
      const code = s.status || 0;
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    }

    // Throughput
    const totalBytes = samples.reduce((sum, s) => sum + (s.bodySize || 0), 0);

    // All latencies (including errors) for distribution
    const allLatencies = samples
      .filter((s) => s.total > 0)
      .map((s) => s.total)
      .sort((a, b) => a - b);

    return {
      totalRequests: samples.length,
      durationMs,
      throughput: {
        requestsPerSec: Math.round((samples.length / durationSec) * 100) / 100,
        bytesPerSec: Math.round((totalBytes / durationSec) * 100) / 100,
        totalBytes,
      },
      latency: {
        min: successLatencies[0] || 0,
        max: successLatencies[successLatencies.length - 1] || 0,
        avg: successLatencies.length > 0
          ? Math.round(successLatencies.reduce((s, v) => s + v, 0) / successLatencies.length)
          : 0,
        median: MetricsCollector._percentile(successLatencies, 50),
        p50: MetricsCollector._percentile(successLatencies, 50),
        p75: MetricsCollector._percentile(successLatencies, 75),
        p90: MetricsCollector._percentile(successLatencies, 90),
        p95: MetricsCollector._percentile(successLatencies, 95),
        p99: MetricsCollector._percentile(successLatencies, 99),
        _allPercentiles: allLatencies.length > 0 ? {
          p50: MetricsCollector._percentile(allLatencies, 50),
          p75: MetricsCollector._percentile(allLatencies, 75),
          p90: MetricsCollector._percentile(allLatencies, 90),
          p95: MetricsCollector._percentile(allLatencies, 95),
          p99: MetricsCollector._percentile(allLatencies, 99),
        } : {},
      },
      ttfb: {
        min: successTtfbs[0] || 0,
        max: successTtfbs[successTtfbs.length - 1] || 0,
        avg: successTtfbs.length > 0
          ? Math.round(successTtfbs.reduce((s, v) => s + v, 0) / successTtfbs.length)
          : 0,
        median: MetricsCollector._percentile(successTtfbs, 50),
      },
      errors: {
        total: errors.length,
        rate: Math.round((errors.length / samples.length) * 10000) / 10000,
        byType: errorByType,
      },
      statusCodes,
    };
  }

  /** Get raw samples for custom analysis. */
  get samples() {
    return [...this._samples];
  }

  /** Reset collector. */
  reset() {
    this._samples = [];
    this._startTime = null;
    this._endTime = null;
  }
}

module.exports = { MetricsCollector };
