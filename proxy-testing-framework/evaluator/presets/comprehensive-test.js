/**
 * Comprehensive Test — full evaluation combining Puppeteer browser tests
 * and extended traffic simulation across multiple behavior profiles.
 */

module.exports = {
  name: "comprehensive-test",
  description: "Full proxy evaluation: browser + multi-profile traffic simulation",

  traffic: {
    enabled: true,
    profile: "general",
    duration: 60000, // 1 minute
    concurrency: 5,
    maxRetries: 2,
  },

  puppeteer: {
    enabled: false, // Requires DISPLAY
    headless: true,
    targets: [
      "https://example.com/",
      "https://httpbin.org/html",
      "https://httpbin.org/get",
      "https://httpbin.org/image/png",
    ],
    navigationTimeout: 30000,
    captureHar: true,
    screenshots: { interval: 10000 },
  },
};
