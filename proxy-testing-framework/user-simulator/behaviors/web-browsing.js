/**
 * web-browsing — Simulates reading news/articles: multiple page navigations,
 * scrolling through content, occasional image loading.
 *
 * Targets: real sites that exercise DNS, TCP, TLS, HTTP/2 through the proxy.
 */

const DEFAULT_URLS = [
  "https://example.com",
  "https://httpbin.org/html",
  "https://httpbin.org/links/10/0",
  "https://httpbin.org/image/jpeg",
];

exports.name = "web-browsing";
exports.description =
  "Simulates news/article reading: page loads, scroll, image loading";

/**
 * @param {Object} opts
 * @param {number} opts.duration - target duration in ms
 * @param {string[]} [opts.urls] - override target URLs
 * @returns {Array<{phase: string, actions: Array}>}
 */
exports.generateSession = function ({ duration = 30000, urls = null, targets = null } = {}) {
  const pages = urls || targets?.pages || DEFAULT_URLS;
  const actions = [];

  // Distribute page visits across the duration.
  // Each visit: load page → scroll → read (wait) → maybe next page.
  const avgVisitMs = 8000; // ~8s per page visit
  const visits = Math.max(2, Math.floor(duration / avgVisitMs));

  for (let i = 0; i < visits; i++) {
    const url = pages[i % pages.length];

    actions.push(
      // Page load
      { type: "navigate", url, waitUntil: "networkidle2", label: `visit-${i}` },
      // Initial scroll
      { type: "scroll", distance: 300, label: `scroll-down-${i}` },
      // Wait (reading time)
      { type: "wait", ms: randomBetween(2000, 5000), label: `read-${i}` },
      // Scroll further
      { type: "scroll", distance: 400, label: `scroll-more-${i}` },
      // More reading time
      { type: "wait", ms: randomBetween(1500, 3000), label: `read-more-${i}` },
      // Scroll back up occasionally
      ...(Math.random() > 0.5
        ? [{ type: "scroll", distance: -200, label: `scroll-up-${i}` }]
        : []),
      // Wait
      { type: "wait", ms: randomBetween(500, 1500), label: `pause-${i}` }
    );
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
