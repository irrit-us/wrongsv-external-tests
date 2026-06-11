/**
 * video-streaming — Simulates watching video: loads a page with a video
 * element, triggers playback, waits for buffering, sustains the session.
 *
 * Uses httpbin's stream-bytes endpoint and delay endpoints to simulate
 * chunked video delivery through the proxy.
 */

exports.name = "video-streaming";
exports.description =
  "Simulates video watching: sustained streaming downloads through proxy";

exports.generateSession = function ({ duration = 30000 } = {}) {
  const actions = [];

  // Phase 1: Load a page (simulating opening a video platform)
  actions.push(
    { type: "navigate", url: "https://httpbin.org/html", waitUntil: "networkidle2", label: "load-platform" },
    { type: "wait", ms: randomBetween(1000, 2000), label: "page-settle" }
  );

  // Phase 2: Simulate video chunk loading — sustained HTTP traffic
  // Multiple stream requests of varying sizes to mimic video segments
  const remainingMs = duration - 3000;
  const chunks = Math.max(3, Math.floor(remainingMs / 5000));

  for (let i = 0; i < chunks; i++) {
    // Video segment sizes: 128KB-1MB to simulate real video chunks
    const segmentSize = randomBetween(128 * 1024, 1024 * 1024);
    actions.push(
      {
        type: "navigate",
        url: `https://httpbin.org/stream-bytes/${segmentSize}`,
        waitUntil: "load",
        label: `video-chunk-${i}`,
      },
      { type: "wait", ms: randomBetween(500, 1500), label: `buffer-${i}` }
    );
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
