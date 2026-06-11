/**
 * Proxy URL parsing and Puppeteer launch option builder.
 *
 * Mirrors puppeteer-debug/ProxyBrowser.js so user-simulator is self-contained.
 */

const PROXY_URL_RE =
  /^(?:(socks5|socks5h|socks4|socks|http|https):\/\/)?(?:([^:@]+):?([^@]*)@)?([^:]+):(\d+)\/?$/i;

function parseProxyUrl(proxyUrl) {
  if (!proxyUrl || proxyUrl === "direct") return null;
  const m = proxyUrl.match(PROXY_URL_RE);
  if (!m) return null;
  return {
    type: (m[1] || "http").toLowerCase(),
    host: m[4],
    port: parseInt(m[5], 10),
    username: m[2] || null,
    password: m[3] || null,
  };
}

function buildLaunchOptions({ proxy, headless = true, extraArgs = [] } = {}) {
  const parsed = parseProxyUrl(proxy);

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    ...extraArgs,
  ];

  if (parsed) {
    args.push(`--proxy-server=${parsed.type}://${parsed.host}:${parsed.port}`);
    if (parsed.type.startsWith("socks")) {
      // Resolve hostnames through the proxy too
      args.push("--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1");
    }
  }

  return {
    headless: headless ? "new" : false,
    args,
    ignoreHTTPSErrors: true,
  };
}

module.exports = { parseProxyUrl, buildLaunchOptions };
