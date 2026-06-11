/**
 * ResultAggregator — merges Puppeteer debug results and traffic simulator
 * metrics into a unified evaluation with scoring.
 */

class ResultAggregator {
  /**
   * @param {Object} puppeteerResult - from DebugSession.run()
   * @param {Object} trafficResult   - from BenchmarkRunner.run()
   * @param {Object} [suiteInfo]     - suite definition for weighting
   */
  constructor(puppeteerResult, trafficResult, suiteInfo = {}) {
    this.puppeteer = puppeteerResult;
    this.traffic = trafficResult;
    this.suiteInfo = suiteInfo;
  }

  /**
   * Produce a unified evaluation report with scores.
   * @returns {Object} aggregated report
   */
  aggregate() {
    const puppeteerScore = this._scorePuppeteer();
    const trafficScore = this._scoreTraffic();
    const overall = this._computeOverall(puppeteerScore, trafficScore);

    return {
      timestamp: new Date().toISOString(),
      suite: this.suiteInfo.name || "custom",
      proxy: this.traffic?.proxy || this.puppeteer?.proxy || "unknown",
      scores: {
        overall,
        puppeteer: puppeteerScore,
        traffic: trafficScore,
      },
      puppeteer: this._summarizePuppeteer(),
      traffic: this._summarizeTraffic(),
      recommendation: this._recommendation(overall),
    };
  }

  _scorePuppeteer() {
    if (!this.puppeteer) return null;

    const nav = this.puppeteer.targets || [];
    const successCount = nav.filter((t) => t.status === "success").length;
    const navSuccessRate =
      nav.length > 0 ? successCount / nav.length : 0;

    let avgNavTime = 0;
    const navTimes = nav
      .filter((t) => t.navigationTimeMs)
      .map((t) => t.navigationTimeMs);
    if (navTimes.length > 0) {
      avgNavTime = navTimes.reduce((a, b) => a + b, 0) / navTimes.length;
    }

    const consoleErrors =
      this.puppeteer.consoleLogs?.errors || 0;
    const totalRequests =
      this.puppeteer.networkSummary?.totalRequests || 0;
    const networkErrors =
      this.puppeteer.networkSummary?.totalErrors || 0;
    const networkErrorRate =
      totalRequests > 0 ? networkErrors / totalRequests : 0;

    // Score components (0–100)
    const navigationScore = navSuccessRate * 100;
    const consoleScore = Math.max(0, 100 - consoleErrors * 10);
    const networkScore = Math.max(0, 100 - networkErrorRate * 100);

    const total = Math.round(
      navigationScore * 0.5 + consoleScore * 0.2 + networkScore * 0.3
    );

    return {
      total,
      components: {
        navigation: Math.round(navigationScore),
        console: Math.round(consoleScore),
        network: Math.round(networkScore),
      },
      details: {
        navSuccessRate,
        avgNavTimeMs: Math.round(avgNavTime),
        consoleErrors,
        totalNetworkRequests: totalRequests,
        networkErrors,
        networkErrorRate: Math.round(networkErrorRate * 10000) / 100,
      },
    };
  }

  _scoreTraffic() {
    if (!this.traffic || !this.traffic.metrics) return null;

    const m = this.traffic.metrics;
    const lat = m.latency;
    const err = m.errors;
    const tp = m.throughput;

    // Latency score: lower is better. <200ms = 100, >5000ms = 0
    const latencyScore = Math.max(
      0,
      Math.min(100, Math.round(100 - (lat.p50 || 0) / 50))
    );

    // Error score: lower is better
    const errorScore = Math.max(0, Math.round(100 - err.rate * 100));

    // Throughput score: higher is better. >50 req/s = 100
    const throughputScore = Math.min(
      100,
      Math.round((tp.requestsPerSec / 50) * 100)
    );

    // Stability score: p95 vs p50 ratio (closer to 1 = more stable)
    const stabilityRatio =
      lat.p50 > 0 ? (lat.p95 || lat.p50) / lat.p50 : 1;
    const stabilityScore = Math.max(
      0,
      Math.min(100, Math.round(100 - (stabilityRatio - 1) * 20))
    );

    const total = Math.round(
      latencyScore * 0.35 +
        errorScore * 0.30 +
        throughputScore * 0.20 +
        stabilityScore * 0.15
    );

    return {
      total,
      components: {
        latency: Math.round(latencyScore),
        error: Math.round(errorScore),
        throughput: Math.round(throughputScore),
        stability: Math.round(stabilityScore),
      },
      details: {
        totalRequests: m.totalRequests,
        latencyMs: { p50: lat.p50, p95: lat.p95, avg: lat.avg },
        errorRate: err.rate,
        throughput: tp.requestsPerSec,
      },
    };
  }

  _computeOverall(puppeteerScore, trafficScore) {
    const scores = [];
    if (puppeteerScore) scores.push({ ...puppeteerScore, weight: 0.3 });
    if (trafficScore) scores.push({ ...trafficScore, weight: 0.7 });

    if (scores.length === 0) return 0;
    const totalWeight = scores.reduce((s, sc) => s + sc.weight, 0);
    return Math.round(
      scores.reduce((s, sc) => s + sc.total * sc.weight, 0) / totalWeight
    );
  }

  _summarizePuppeteer() {
    if (!this.puppeteer) return null;
    return {
      success: this.puppeteer.targets?.every((t) => t.status === "success") ?? false,
      targetsVisited: this.puppeteer.targets?.length || 0,
      totalNetworkRequests:
        this.puppeteer.networkSummary?.totalRequests || 0,
      consoleErrors: this.puppeteer.consoleLogs?.errors || 0,
      screenshots: this.puppeteer.screenshots?.length || 0,
      harPath: this.puppeteer.harPath,
    };
  }

  _summarizeTraffic() {
    if (!this.traffic) return null;
    return {
      profile: this.traffic.profile,
      durationMs: this.traffic.durationMs,
      totalRequests: this.traffic.metrics?.totalRequests || 0,
      p50Latency: this.traffic.metrics?.latency?.p50 || 0,
      p95Latency: this.traffic.metrics?.latency?.p95 || 0,
      errorRate: this.traffic.metrics?.errors?.rate || 0,
      throughput: this.traffic.metrics?.throughput?.requestsPerSec || 0,
    };
  }

  _recommendation(score) {
    if (score >= 90) return "EXCELLENT — proxy performs well across all metrics";
    if (score >= 75) return "GOOD — minor issues detected, suitable for production";
    if (score >= 50) return "FAIR — notable latency or stability issues, monitor closely";
    if (score >= 25) return "POOR — significant performance problems detected";
    return "FAIL — proxy is unreliable or non-functional";
  }
}

module.exports = { ResultAggregator };
