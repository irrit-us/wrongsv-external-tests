/**
 * download-heavy — Simulates a user opening a page and triggering repeated
 * file downloads. Useful for stressing long-lived transfer throughput and
 * per-user byte accounting.
 */

exports.name = "download-heavy";
exports.description =
  "Simulates repeated file downloads with short pauses between transfers";

exports.generateSession = function ({ duration = 30000, targets = null } = {}) {
  const actions = [];
  const landing = targets?.videoLanding || targets?.storeLanding || "https://httpbin.org/html";
  const downloads =
    targets?.downloads || [
      "https://httpbin.org/stream-bytes/262144",
      "https://httpbin.org/stream-bytes/524288",
      "https://httpbin.org/stream-bytes/1048576",
    ];

  actions.push(
    { type: "navigate", url: landing, waitUntil: "networkidle2", label: "landing" },
    { type: "wait", ms: randomBetween(500, 1200), label: "landing-pause" }
  );

  const cycles = Math.max(3, Math.floor(duration / 5000));
  for (let i = 0; i < cycles; i++) {
    const url = downloads[i % downloads.length];
    actions.push(
      {
        type: "evaluate",
        code: `fetch(${JSON.stringify(url)}).then((r) => r.arrayBuffer())`,
        label: `download-${i}`,
      },
      { type: "wait", ms: randomBetween(400, 1200), label: `download-pause-${i}` }
    );
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
