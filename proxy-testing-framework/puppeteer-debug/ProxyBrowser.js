/**
 * ProxyBrowser — Launches Puppeteer with proxy configuration.
 *
 * Parses proxy URLs of the form:
 *   socks5://host:port
 *   socks5h://host:port  (DNS through proxy)
 *   http://host:port
 *   https://host:port
 *
 * Applies --proxy-server and optional proxy authentication.
 */

class ProxyBrowser {
  /**
   * Parse a proxy URL string into { type, host, port, username, password }.
   * Returns null for direct (no proxy) or invalid URLs.
   */
  static parseProxyUrl(proxyUrl) {
    if (!proxyUrl || proxyUrl === "direct") return null;

    try {
      const u = new URL(proxyUrl);
      const type = u.protocol.replace(":", ""); // socks5, socks5h, http, https
      const host = u.hostname;
      const port = parseInt(u.port, 10) || (type === "http" || type === "https" ? 80 : 1080);
      const username = u.username || undefined;
      const password = u.password || undefined;

      return { type, host, port, username, password };
    } catch {
      // Fallback: try host:port format
      const parts = proxyUrl.split(":");
      if (parts.length === 2) {
        return { type: "http", host: parts[0], port: parseInt(parts[1], 10) };
      }
      return null;
    }
  }

  /**
   * Build Puppeteer launch options for the given proxy URL.
   *
   * @param {Object} options
   * @param {string}  options.proxy         - proxy URL (e.g. socks5://127.0.0.1:1080)
   * @param {boolean} [options.headless]    - default true ("new" mode)
   * @param {string[]}[options.extraArgs]   - additional Chrome flags
   * @returns {Object} puppeteer.launch options
   */
  static buildLaunchOptions({ proxy, headless = true, extraArgs = [] } = {}) {
    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      ...extraArgs,
    ];

    const proxyInfo = ProxyBrowser.parseProxyUrl(proxy);
    if (proxyInfo) {
      let proxyArg;
      if (proxyInfo.type === "socks5" || proxyInfo.type === "socks5h") {
        proxyArg = `socks5://${proxyInfo.host}:${proxyInfo.port}`;
      } else if (proxyInfo.type === "socks4") {
        proxyArg = `socks4://${proxyInfo.host}:${proxyInfo.port}`;
      } else {
        proxyArg = `${proxyInfo.type}://${proxyInfo.host}:${proxyInfo.port}`;
      }
      args.push(`--proxy-server=${proxyArg}`);
    }

    return {
      headless: headless === false ? false : "new",
      args,
      // Ignore HTTPS certificate errors commonly caused by proxy MITM
      ignoreHTTPSErrors: true,
    };
  }

  /**
   * Launch a Puppeteer browser through the given proxy.
   *
   * @param {Object} options — passed to buildLaunchOptions
   * @returns {Promise<import('puppeteer').Browser>}
   */
  static async launch(options = {}) {
    const puppeteer = require("puppeteer");
    const launchOpts = ProxyBrowser.buildLaunchOptions(options);
    const browser = await puppeteer.launch(launchOpts);

    // Handle proxy authentication if credentials were provided
    const proxyInfo = ProxyBrowser.parseProxyUrl(options.proxy);
    if (proxyInfo && proxyInfo.username) {
      const pages = await browser.pages();
      for (const page of pages) {
        await page.authenticate({
          username: proxyInfo.username,
          password: proxyInfo.password || "",
        });
      }
      // Also authenticate new pages
      browser.on("targetcreated", async (target) => {
        if (target.type() === "page") {
          const page = await target.page();
          if (page) {
            await page.authenticate({
              username: proxyInfo.username,
              password: proxyInfo.password || "",
            });
          }
        }
      });
    }

    return browser;
  }

  /**
   * Convenience: launch browser and return { browser, page }.
   */
  static async launchWithPage(options = {}) {
    const browser = await ProxyBrowser.launch(options);
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    return { browser, page };
  }
}

module.exports = { ProxyBrowser };
