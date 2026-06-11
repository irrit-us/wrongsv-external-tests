/**
 * Throughput Test — measures maximum proxy throughput with concurrent
 * connections and large responses.
 */

module.exports = {
  name: "throughput-test",
  description: "Maximum proxy throughput measurement under load",

  traffic: {
    enabled: true,
    profile: "api-heavy",
    duration: 30000, // 30 seconds
    concurrency: 10,
    maxRetries: 2,
  },

  puppeteer: {
    enabled: false,
    headless: true,
    targets: ["https://httpbin.org/stream-bytes/65536"],
    navigationTimeout: 30000,
    captureHar: false,
    screenshots: false,
  },
};
