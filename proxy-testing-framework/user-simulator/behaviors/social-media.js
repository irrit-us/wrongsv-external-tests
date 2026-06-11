/**
 * social-media — Simulates social feed scrolling: rapid page loads,
 * many image requests, intermittent scroll bursts, short attention spans.
 */

exports.name = "social-media";
exports.description =
  "Simulates social feed scrolling: rapid loads, images, scroll bursts";

exports.generateSession = function ({ duration = 30000 } = {}) {
  const actions = [];

  // Feed pages with different content types
  const feedTargets = [
    { url: "https://httpbin.org/image/jpeg", type: "image" },
    { url: "https://httpbin.org/image/png", type: "image" },
    { url: "https://httpbin.org/image/svg", type: "image" },
    { url: "https://httpbin.org/html", type: "text" },
    { url: "https://httpbin.org/links/5/0", type: "links" },
  ];

  // Simulate fast feed scrolling — many quick interactions
  const interactionMs = 2000; // ~2s per feed item
  const items = Math.max(5, Math.floor(duration / interactionMs));

  // Start with a page load
  actions.push(
    { type: "navigate", url: "https://httpbin.org/links/10/0", waitUntil: "networkidle2", label: "open-feed" },
    { type: "wait", ms: randomBetween(800, 1500), label: "feed-load" }
  );

  for (let i = 0; i < items; i++) {
    // Scroll to next "post"
    actions.push(
      { type: "scroll", distance: randomBetween(100, 500), label: `scroll-${i}` },
      { type: "wait", ms: randomBetween(300, 1200), label: `view-${i}` }
    );

    // Some "posts" trigger image loads (navigate to image endpoints)
    if (Math.random() > 0.6) {
      const target = feedTargets[Math.floor(Math.random() * feedTargets.length)];
      actions.push(
        {
          type: "navigate",
          url: target.url,
          waitUntil: "load",
          label: `view-content-${i}`,
        },
        { type: "wait", ms: randomBetween(500, 2000), label: `content-load-${i}` }
      );
      // Go back to feed
      actions.push(
        {
          type: "navigate",
          url: "https://httpbin.org/links/10/0",
          waitUntil: "networkidle2",
          label: `back-feed-${i}`,
        },
        { type: "wait", ms: randomBetween(300, 800), label: `feed-restore-${i}` }
      );
    }
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
