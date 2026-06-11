/**
 * Stability Test — long-running evaluation to detect connection drops,
 * memory leaks, timeout creep, and proxy degradation over time.
 */

module.exports = {
  name: "stability-test",
  description: "Long-running proxy stability evaluation (recommend 5+ minutes)",

  traffic: {
    enabled: true,
    profile: "general",
    duration: 300000, // 5 minutes (override with --duration)
    concurrency: 4,
    maxRetries: 1,
  },

  puppeteer: {
    enabled: false, // Requires DISPLAY
    headless: true,
    targets: ["https://example.com/", "https://httpbin.org/html"],
    navigationTimeout: 30000,
    captureHar: true,
    screenshots: { interval: 30000 }, // every 30s
  },
};
