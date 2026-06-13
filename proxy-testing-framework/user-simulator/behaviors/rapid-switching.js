/**
 * rapid-switching — Simulates an impatient user bouncing between pages,
 * opening items, and returning quickly. Useful for connection churn and
 * short-lived request bursts in a real browser.
 */

exports.name = "rapid-switching";
exports.description =
  "Simulates rapid navigation between feed, article, store, and form pages";

exports.generateSession = function ({ duration = 30000, targets = null } = {}) {
  const actions = [];
  const pages =
    targets?.switchingPages || [
      "https://httpbin.org/html",
      "https://httpbin.org/links/5/0",
      "https://httpbin.org/image/png",
      "https://httpbin.org/forms/post",
    ];

  const hops = Math.max(5, Math.floor(duration / 2500));
  for (let i = 0; i < hops; i++) {
    const url = pages[i % pages.length];
    actions.push(
      { type: "navigate", url, waitUntil: "load", label: `hop-${i}` },
      { type: "wait", ms: randomBetween(250, 800), label: `glance-${i}` },
      { type: "scroll", distance: randomBetween(80, 260), label: `scroll-${i}` },
      { type: "wait", ms: randomBetween(150, 500), label: `settle-${i}` }
    );
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
