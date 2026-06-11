/**
 * Local test — tests against a local test server (bypasses external network).
 *
 * Requires the local test server to be running:
 *   node local-test-server.js --port 3099
 */

module.exports = {
  name: "local-test",
  description: "Quick test against local test server — no external network needed",

  traffic: {
    enabled: true,
    profile: "local-general",
    duration: 10000, // 10 seconds
    concurrency: 3,
    maxRetries: 0,
  },

  puppeteer: {
    enabled: false, // Requires DISPLAY, local server doesn't need it
    headless: true,
    targets: [],
    navigationTimeout: 10000,
    captureHar: false,
    screenshots: false,
  },
};
