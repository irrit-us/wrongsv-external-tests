/**
 * Latency Test — quick measurement of proxy responsiveness.
 *
 * Runs a small traffic simulation with the quick-check profile and
 * (optionally) a Puppeteer session to measure navigation latency.
 */

module.exports = {
  name: "latency-test",
  description: "Quick proxy latency and responsiveness measurement",

  traffic: {
    enabled: true,
    profile: "quick-check",
    duration: 10000, // 10 seconds
    concurrency: 2,
    maxRetries: 1,
  },

  puppeteer: {
    enabled: false, // Fails without X display; set to true when DISPLAY is available
    headless: true,
    targets: ["https://httpbin.org/get"],
    navigationTimeout: 15000,
    captureHar: false,
    screenshots: false,
  },
};
