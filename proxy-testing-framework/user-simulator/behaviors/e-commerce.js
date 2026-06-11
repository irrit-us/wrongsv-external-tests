/**
 * e-commerce — Simulates online shopping: product browsing, search-like
 * behavior, multiple product page views, image-heavy loading.
 */

exports.name = "e-commerce";
exports.description =
  "Simulates online shopping: product browsing, image loads, page hopping";

exports.generateSession = function ({ duration = 30000 } = {}) {
  const actions = [];

  // Product catalog pages (simulated with httpbin)
  const productPages = [
    "https://httpbin.org/image/jpeg",
    "https://httpbin.org/image/png",
    "https://httpbin.org/image/webp",
  ];

  // Landing page
  actions.push(
    { type: "navigate", url: "https://httpbin.org/html", waitUntil: "networkidle2", label: "landing" },
    { type: "wait", ms: randomBetween(1000, 2500), label: "browse-landing" },
    { type: "scroll", distance: 200, label: "scroll-landing" },
    { type: "wait", ms: randomBetween(500, 1500), label: "pause-landing" }
  );

  // Browse product listings
  actions.push(
    { type: "navigate", url: "https://httpbin.org/links/8/0", waitUntil: "networkidle2", label: "search-results" },
    { type: "wait", ms: randomBetween(800, 2000), label: "scan-results" },
    { type: "scroll", distance: 350, label: "scroll-results" },
    { type: "wait", ms: randomBetween(800, 2000), label: "view-results" },
    { type: "scroll", distance: 300, label: "scroll-more-results" }
  );

  // View individual product pages (image loads)
  const productMs = duration - 12000;
  const products = Math.max(2, Math.floor(productMs / 4000));

  for (let i = 0; i < products; i++) {
    const productUrl =
      productPages[Math.floor(Math.random() * productPages.length)];
    actions.push(
      {
        type: "navigate",
        url: productUrl,
        waitUntil: "load",
        label: `product-${i}`,
      },
      { type: "wait", ms: randomBetween(1000, 3000), label: `view-product-${i}` },
      // Scroll product images
      { type: "scroll", distance: 150, label: `scroll-product-${i}` },
      { type: "wait", ms: randomBetween(500, 1500), label: `detail-${i}` }
    );

    // Sometimes go "back to results"
    if (Math.random() > 0.6) {
      actions.push(
        {
          type: "navigate",
          url: "https://httpbin.org/links/8/0",
          waitUntil: "networkidle2",
          label: `back-results-${i}`,
        },
        { type: "wait", ms: randomBetween(500, 1000), label: `resume-browse-${i}` }
      );
    }
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
