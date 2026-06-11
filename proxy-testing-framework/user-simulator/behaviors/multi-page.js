/**
 * multi-page — Simulates tabbed browsing: opens multiple pages in sequence,
 * each with different content types. Stresses connection pooling and
 * concurrent request handling through the proxy.
 */

exports.name = "multi-page";
exports.description =
  "Simulates multi-tab browsing: different content types, connection pooling";

exports.generateSession = function ({ duration = 30000 } = {}) {
  const actions = [];

  // Diverse target set — each page exercises different proxy behaviors
  const sites = [
    { url: "https://httpbin.org/html", label: "html-page", type: "text/html" },
    { url: "https://httpbin.org/image/jpeg", label: "jpeg-image", type: "image/jpeg" },
    { url: "https://httpbin.org/image/png", label: "png-image", type: "image/png" },
    { url: "https://httpbin.org/gzip", label: "gzip-json", type: "gzip" },
    { url: "https://httpbin.org/stream-bytes/65536", label: "stream-64k", type: "stream" },
    { url: "https://httpbin.org/delay/1", label: "delay-1s", type: "delay" },
    { url: "https://httpbin.org/links/5/0", label: "links-page", type: "text/html" },
  ];

  const pageMs = Math.max(3000, duration / Math.max(3, sites.length));
  const pages = Math.min(sites.length, Math.floor(duration / pageMs));

  for (let i = 0; i < pages; i++) {
    const site = sites[i % sites.length];
    const waitStrategy = site.type.includes("image") ? "load" : "networkidle2";

    actions.push(
      { type: "navigate", url: site.url, waitUntil: waitStrategy, label: site.label },
      { type: "wait", ms: randomBetween(500, 1500), label: `settle-${i}` },
      { type: "scroll", distance: 100, label: `micro-scroll-${i}` },
      { type: "wait", ms: randomBetween(300, 800), label: `view-${i}` }
    );
  }

  // End with a page that confirms all connections were proxied
  actions.push(
    { type: "navigate", url: "https://httpbin.org/ip", waitUntil: "networkidle2", label: "check-ip" },
    { type: "wait", ms: 1000, label: "final" }
  );

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
