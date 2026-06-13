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

function pageShell(title, body, extraHead = "") {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/static/style.css">
  ${extraHead}
</head>
<body>
  <header>
    <nav>
      <a href="/page/news" id="nav-news">News</a>
      <a href="/page/feed" id="nav-feed">Feed</a>
      <a href="/page/store" id="nav-store">Store</a>
      <a href="/page/form" id="nav-form">Form</a>
      <a href="/page/video" id="nav-video">Video</a>
    </nav>
  </header>
  <main>${body}</main>
  <script src="/static/app.js"></script>
</body>
</html>`;
}

function makeParagraphs(count, seed) {
  return Array.from({ length: count }, (_, idx) => {
    return `<p>Paragraph ${idx + 1} for ${seed}. The proxy harness uses this content to exercise scrolling, asset fetching, and sustained reads.</p>`;
  }).join("\n");
}

function newsPage() {
  return pageShell(
    "Daily Dispatch",
    `
    <section id="hero">
      <h1>Daily Dispatch</h1>
      <p>Deterministic long-form content for browser simulation.</p>
      <img src="/image/photo.jpeg" alt="hero" width="640" height="320">
    </section>
    <section id="articles">
      <article class="news-card"><a class="article-link" href="/page/article/1">Edge Router Outage Drill</a></article>
      <article class="news-card"><a class="article-link" href="/page/article/2">Protocol Migration Retrospective</a></article>
      <article class="news-card"><a class="article-link" href="/page/article/3">Traffic Engineering Notes</a></article>
    </section>
    `
  );
}

function articlePage(id) {
  return pageShell(
    `Article ${id}`,
    `
    <article id="article-${id}">
      <h1>Article ${id}</h1>
      <p class="dek">Synthetic article ${id} for deterministic news-reading tests.</p>
      <img src="/image/logo.png" alt="thumb" width="128" height="128">
      ${makeParagraphs(18, `article-${id}`)}
      <section id="related">
        <a class="article-link" href="/page/article/${(id % 3) + 1}">Related article</a>
        <a class="article-link" href="/page/news">Back to headlines</a>
      </section>
    </article>
    `
  );
}

function feedPage() {
  const cards = Array.from({ length: 12 }, (_, idx) => {
    const n = idx + 1;
    return `
      <article class="feed-card" id="feed-card-${n}">
        <h2>Feed Item ${n}</h2>
        <img src="/image/photo.jpeg?item=${n}" alt="feed-${n}" width="320" height="180">
        <p>Fast-scan card ${n} for social and rapid-switching simulations.</p>
        <a class="feed-link" href="/page/feed/item/${n}">Open item</a>
      </article>
    `;
  }).join("\n");
  return pageShell("Feed", `<section id="feed">${cards}</section>`);
}

function feedItemPage(id) {
  return pageShell(
    `Feed Item ${id}`,
    `
    <article id="feed-item-${id}">
      <h1>Feed Item ${id}</h1>
      <p>This page simulates a deep-linked feed item.</p>
      ${makeParagraphs(8, `feed-item-${id}`)}
      <a class="feed-link" href="/page/feed">Back to feed</a>
    </article>
    `
  );
}

function storeLanding() {
  return pageShell(
    "Storefront",
    `
    <section id="store-hero">
      <h1>Storefront</h1>
      <p>Catalog and product pages for browse-and-click behavior.</p>
      <a class="catalog-link" href="/page/store/catalog">Browse catalog</a>
    </section>
    `
  );
}

function storeCatalog() {
  const products = Array.from({ length: 6 }, (_, idx) => {
    const id = idx + 1;
    return `
      <article class="product-card">
        <img src="/image/logo.png?product=${id}" alt="product-${id}" width="96" height="96">
        <h2>Product ${id}</h2>
        <p>Reusable product card ${id}.</p>
        <a class="product-link" href="/page/store/product/${id}">View product</a>
      </article>
    `;
  }).join("\n");
  return pageShell("Catalog", `<section id="catalog">${products}</section>`);
}

function productPage(id) {
  return pageShell(
    `Product ${id}`,
    `
    <article id="product-${id}">
      <h1>Product ${id}</h1>
      <button id="add-to-cart" type="button">Add to cart</button>
      <button id="buy-now" type="button">Buy now</button>
      <p class="price">$${(id * 7 + 12).toFixed(2)}</p>
      ${makeParagraphs(10, `product-${id}`)}
      <a class="catalog-link" href="/page/store/catalog">Back to catalog</a>
    </article>
    `,
    `<script>
      window.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('add-to-cart');
        if (el) {
          el.addEventListener('click', () => {
            fetch('/api/echo', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ action: 'add-to-cart', productId: ${id} })
            });
          });
        }
      });
    </script>`
  );
}

function formPage() {
  return pageShell(
    "Order Form",
    `
    <section>
      <h1>Order Form</h1>
      <form action="/api/echo" method="post">
        <label>Name <input name="custname" type="text"></label>
        <label>Phone <input name="custtel" type="tel"></label>
        <label>Email <input name="custemail" type="email"></label>
        <fieldset>
          <legend>Size</legend>
          <label><input type="radio" name="size" value="small"> Small</label>
          <label><input type="radio" name="size" value="medium"> Medium</label>
          <label><input type="radio" name="size" value="large"> Large</label>
        </fieldset>
        <label>Comments <textarea name="comments"></textarea></label>
        <button type="submit">Submit</button>
      </form>
    </section>
    `
  );
}

function videoPage() {
  return pageShell(
    "Video Hub",
    `
    <section id="video-landing">
      <h1>Video Hub</h1>
      <p>Large chunked assets exercise sustained downloads.</p>
      <video id="demo-video" controls preload="metadata" width="640">
        <source src="/stream/chunked/262144?chunk=16384&delay=8" type="application/octet-stream">
      </video>
      <a class="segment-link" href="/download/524288">Download segment</a>
      <a class="segment-link" href="/download/1048576">Download HD segment</a>
    </section>
    `
  );
}

function sendDownload(res, size) {
  const buf = randomBytes(size);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="fixture-${size}.bin"`,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "X-Response-Time": Date.now().toString(),
  });
  res.end(buf);
}

function sendChunked(res, size, chunkSize, delayMs) {
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-store",
    "X-Response-Time": Date.now().toString(),
  });

  let sent = 0;
  const timer = setInterval(() => {
    if (sent >= size) {
      clearInterval(timer);
      res.end();
      return;
    }
    const remaining = size - sent;
    const nextSize = Math.min(chunkSize, remaining);
    res.write(randomBytes(nextSize));
    sent += nextSize;
  }, delayMs);

  res.on("close", () => clearInterval(timer));
}

// --- Request logger ---

function log(req, status) {
  if (VERBOSE) {
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.url} → ${status}`
    );
  }
}

function encodeMockDocId(url) {
  return Buffer.from(url, "utf8").toString("base64url");
}

function decodeMockDocId(id) {
  return Buffer.from(id, "base64url").toString("utf8");
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

  if (path === "/page/news") {
    log(req, 200);
    return html(res, newsPage());
  }

  if (path.startsWith("/page/article/")) {
    const id = parseInt(path.split("/")[3], 10) || 1;
    log(req, 200);
    return html(res, articlePage(id));
  }

  if (path === "/page/feed") {
    log(req, 200);
    return html(res, feedPage());
  }

  if (path.startsWith("/page/feed/item/")) {
    const id = parseInt(path.split("/")[4], 10) || 1;
    log(req, 200);
    return html(res, feedItemPage(id));
  }

  if (path === "/page/store") {
    log(req, 200);
    return html(res, storeLanding());
  }

  if (path === "/page/store/catalog") {
    log(req, 200);
    return html(res, storeCatalog());
  }

  if (path.startsWith("/page/store/product/")) {
    const id = parseInt(path.split("/")[4], 10) || 1;
    log(req, 200);
    return html(res, productPage(id));
  }

  if (path === "/page/form") {
    log(req, 200);
    return html(res, formPage());
  }

  if (path === "/page/video") {
    log(req, 200);
    return html(res, videoPage());
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

  if (path === "/mock-gdocs/viewer") {
    const originUrl = url.searchParams.get("url");
    if (!originUrl) {
      log(req, 400);
      return text(res, "missing url", 400);
    }
    const docId = encodeMockDocId(originUrl);
    log(req, 200);
    return text(res, `... "/mock-gdocs/viewerng/text?id=${docId}&page=0" ...`);
  }

  if (path === "/mock-gdocs/viewerng/text") {
    const docId = url.searchParams.get("id");
    if (!docId) {
      log(req, 400);
      return text(res, "missing id", 400);
    }
    (async () => {
      try {
        const originUrl = decodeMockDocId(docId);
        const upstream = await fetch(originUrl);
        const originBody = await upstream.text();
        if (!upstream.ok) {
          log(req, 502);
          return text(res, "origin fetch failed", 502);
        }
        const body = `)]}'\n${JSON.stringify({
          mimetype: "text/plain",
          data: originBody,
        })}`;
        log(req, 200);
        return text(res, body);
      } catch (error) {
        log(req, 500);
        return text(res, `mock gdocs error: ${error.message}`, 500);
      }
    })();
    return;
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

  if (path.startsWith("/download/")) {
    const size = parseInt(path.split("/")[2], 10) || 65536;
    log(req, 200);
    return sendDownload(res, size);
  }

  if (path.startsWith("/stream/chunked/")) {
    const size = parseInt(path.split("/")[3], 10) || 262144;
    const chunkSize = parseInt(url.searchParams.get("chunk") || "16384", 10);
    const delayMs = parseInt(url.searchParams.get("delay") || "10", 10);
    log(req, 200);
    return sendChunked(res, size, chunkSize, delayMs);
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
  console.error(`  http://127.0.0.1:${PORT}/download/524288     512KB download`);
  console.error(`  http://127.0.0.1:${PORT}/stream/chunked/262144?chunk=16384&delay=8  chunked stream`);
  console.error(`  http://127.0.0.1:${PORT}/page/news           article hub`);
  console.error(`  http://127.0.0.1:${PORT}/page/feed           feed page`);
  console.error(`  http://127.0.0.1:${PORT}/page/store/catalog  product catalog`);
  console.error(`  http://127.0.0.1:${PORT}/page/form           form workflow`);
  console.error(`  http://127.0.0.1:${PORT}/page/video          streaming landing`);
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
