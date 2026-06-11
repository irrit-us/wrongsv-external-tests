#!/usr/bin/env node
/**
 * Local test server for proxy evaluation.
 *
 * Simulates real-world endpoints: HTML pages, JSON API, images, streaming,
 * delays, and error conditions.  All responses include timing headers so
 * the proxy-testing-framework can measure latency accurately.
 *
 * Usage:
 *   node local-test-server.js              # default port 3099
 *   node local-test-server.js --port 3000
 *   node local-test-server.js --verbose     # log each request
 */

const http = require("http");
const { randomBytes } = require("crypto");

const PORT = parseInt(process.argv[process.argv.indexOf("--port") + 1] || 3099, 10);
const VERBOSE = process.argv.includes("--verbose");

// --- Response helpers ---

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Response-Time": Date.now().toString(),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function html(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Response-Time": Date.now().toString(),
  });
  res.end(body);
}

function bytes(res, size) {
  const buf = randomBytes(size);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": buf.length,
    "X-Response-Time": Date.now().toString(),
  });
  res.end(buf);
}

function delayed(res, ms, handler) {
  setTimeout(() => handler(res), ms);
}

function text(res, body, status = 200, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Response-Time": Date.now().toString(),
    ...extraHeaders,
  });
  res.end(body);
}

// --- Request logger ---

function log(req, status) {
  if (VERBOSE) {
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.url} → ${status}`
    );
  }
}

// --- Router ---

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  // ── HTML pages ────────────────────────────────────────────

  if (path === "/" || path === "/index.html") {
    const page = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body>
  <h1>Proxy Test Server</h1>
  <p>This page simulates a real web page with embedded resources.</p>
  <img src="/image/logo.png" alt="logo" width="100" height="100">
  <script src="/static/app.js"></script>
</body></html>`;
    log(req, 200);
    return html(res, page);
  }

  if (path === "/html") {
    const page = `<html><head><title>Test</title></head><body><div id="app"><p>Hello from proxy test server</p></div></body></html>`;
    log(req, 200);
    return html(res, page);
  }

  // ── JSON API ──────────────────────────────────────────────

  if (path === "/api/status") {
    log(req, 200);
    return json(res, { status: "ok", uptime: process.uptime(), version: "1.0.0" });
  }

  if (path === "/api/user") {
    log(req, 200);
    return json(res, {
      id: 42,
      name: "Test User",
      email: "test@example.com",
      createdAt: "2026-01-01T00:00:00Z",
    });
  }

  if (path === "/api/headers") {
    log(req, 200);
    return json(res, {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });
  }

  if (path === "/api/echo" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      log(req, 200);
      try {
        return json(res, { echo: JSON.parse(body) });
      } catch {
        return json(res, { echo: body });
      }
    });
    return;
  }

  if (path === "/api/uuid") {
    log(req, 200);
    return json(res, { uuid: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  }

  // ── Static "assets" ───────────────────────────────────────

  if (path === "/static/app.js") {
    const js = 'console.log("proxy-test-server loaded"); window.TEST = true;';
    log(req, 200);
    res.writeHead(200, {
      "Content-Type": "application/javascript",
      "Content-Length": Buffer.byteLength(js),
      "X-Response-Time": Date.now().toString(),
    });
    return res.end(js);
  }

  if (path === "/static/style.css") {
    const css = "body { font-family: sans-serif; margin: 0; } h1 { color: #333; }";
    log(req, 200);
    res.writeHead(200, {
      "Content-Type": "text/css",
      "Content-Length": Buffer.byteLength(css),
      "X-Response-Time": Date.now().toString(),
    });
    return res.end(css);
  }

  // ── Images / binary ───────────────────────────────────────

  if (path === "/image/logo.png") {
    log(req, 200);
    return bytes(res, 2048); // 2KB fake PNG
  }

  if (path === "/image/photo.jpeg") {
    log(req, 200);
    return bytes(res, 8192); // 8KB fake JPEG
  }

  if (path.startsWith("/stream/")) {
    const size = parseInt(path.split("/")[2], 10) || 4096;
    log(req, 200);
    return bytes(res, size);
  }

  // ── Delayed responses ─────────────────────────────────────

  if (path === "/delay/0") {
    log(req, 200);
    return json(res, { delayed: false, ms: 0 });
  }

  if (path.startsWith("/delay/")) {
    const ms = parseInt(path.split("/")[2], 10) || 100;
    log(req, 200);
    return delayed(res, ms, () => json(res, { delayed: true, ms }));
  }

  // ── Gzip response ─────────────────────────────────────────

  if (path === "/gzip") {
    const { gzipSync } = require("zlib");
    const payload = JSON.stringify({ gzip: true, data: "x".repeat(500) });
    const compressed = gzipSync(payload);
    log(req, 200);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Content-Length": compressed.length,
      "X-Response-Time": Date.now().toString(),
    });
    return res.end(compressed);
  }

  // ── Error conditions ──────────────────────────────────────

  if (path === "/error/400") {
    log(req, 400);
    return json(res, { error: "Bad Request" }, 400);
  }
  if (path === "/error/500") {
    log(req, 500);
    return json(res, { error: "Internal Server Error" }, 500);
  }
  if (path === "/error/timeout") {
    // Never respond — simulate timeout
    log(req, -1);
    return;
  }

  // ── 404 ───────────────────────────────────────────────────

  log(req, 404);
  return json(res, { error: "Not Found", path }, 404);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`ERROR: Port ${PORT} is already in use. Try: node local-test-server.js --port ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`Local test server listening on http://127.0.0.1:${PORT}`);
  console.error(`Endpoints:`);
  console.error(`  http://127.0.0.1:${PORT}/                 HTML page`);
  console.error(`  http://127.0.0.1:${PORT}/html              Simple HTML`);
  console.error(`  http://127.0.0.1:${PORT}/api/status         JSON status`);
  console.error(`  http://127.0.0.1:${PORT}/api/user           JSON user`);
  console.error(`  http://127.0.0.1:${PORT}/api/headers        Request headers echo`);
  console.error(`  http://127.0.0.1:${PORT}/api/echo           POST echo`);
  console.error(`  http://127.0.0.1:${PORT}/static/app.js       JS asset`);
  console.error(`  http://127.0.0.1:${PORT}/image/logo.png      2KB image`);
  console.error(`  http://127.0.0.1:${PORT}/stream/16384        16KB stream`);
  console.error(`  http://127.0.0.1:${PORT}/delay/200           200ms delay`);
  console.error(`  http://127.0.0.1:${PORT}/gzip               Gzip response`);
  console.error(`  http://127.0.0.1:${PORT}/error/500           Server error`);
  console.error(``);
  console.error(`PID: ${process.pid}`);
  console.error(`Press Ctrl+C to stop`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.error("\nShutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
