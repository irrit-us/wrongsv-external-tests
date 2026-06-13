/**
 * BehaviorProfile — defines realistic user traffic patterns for proxy testing.
 *
 * Each profile specifies the mix of request types, concurrency, timing pattern,
 * and request templates that simulate a particular usage scenario.
 *
 * Built-in profiles:
 *   web-browsing   — mixed static assets + XHR, bursty, 3-5 concurrent
 *   video-streaming — large sequential downloads, 1-2 concurrent
 *   api-heavy      — REST API calls, POST/PUT/DELETE, 5-10 concurrent
 *   social-media   — image-heavy scrolling, intermittent bursts
 *   general        — balanced mix of everything
 *   quick-check    — minimal requests, fast latency check
 */

const REQUEST_TEMPLATES = {
  // Typical web page resources
  htmlPage: {
    urls: [
      "https://httpbin.org/html",
      "https://example.com/",
      "https://httpbin.org/get",
    ],
    method: "GET",
    weight: 3,
  },
  staticImage: {
    urls: [
      "https://httpbin.org/image/png",
      "https://httpbin.org/image/jpeg",
      "https://httpbin.org/image/webp",
    ],
    method: "GET",
    weight: 2,
  },
  apiGet: {
    urls: [
      "https://httpbin.org/json",
      "https://httpbin.org/uuid",
      "https://httpbin.org/user-agent",
      "https://httpbin.org/headers",
    ],
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    weight: 5,
  },
  apiPost: {
    urls: ["https://httpbin.org/post", "https://httpbin.org/anything"],
    method: "POST",
    body: JSON.stringify({ test: true, timestamp: Date.now() }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    weight: 2,
  },
  apiPut: {
    urls: ["https://httpbin.org/put"],
    method: "PUT",
    body: JSON.stringify({ update: Date.now() }),
    headers: { "Content-Type": "application/json" },
    weight: 1,
  },
  apiDelete: {
    urls: ["https://httpbin.org/delete?id=test"],
    method: "DELETE",
    headers: { Accept: "application/json" },
    weight: 1,
  },
  streamBytes: {
    urls: [
      "https://httpbin.org/stream-bytes/1024",
      "https://httpbin.org/stream-bytes/4096",
      "https://httpbin.org/stream-bytes/16384",
    ],
    method: "GET",
    weight: 1,
  },
  delayResponse: {
    urls: [
      "https://httpbin.org/delay/0",
      "https://httpbin.org/delay/0",
      "https://httpbin.org/delay/0",
    ],
    method: "GET",
    weight: 1,
  },
  gzipResponse: {
    urls: ["https://httpbin.org/gzip"],
    method: "GET",
    headers: { "Accept-Encoding": "gzip, deflate" },
    weight: 1,
  },
};

const PROFILE_DEFINITIONS = {
  "web-browsing": {
    description: "Simulates web browsing: pages, images, XHR",
    templateMix: {
      htmlPage: 0.25,
      staticImage: 0.20,
      apiGet: 0.35,
      apiPost: 0.10,
      streamBytes: 0.05,
      delayResponse: 0.05,
    },
    concurrency: { min: 2, max: 4 },
    delayBetweenRequests: { min: 50, max: 500 },
    burstPattern: {
      burstSize: { min: 3, max: 8 },
      pauseBetweenBursts: { min: 1000, max: 5000 },
    },
    rampUpMs: 3000,
  },

  "video-streaming": {
    description: "Simulates video streaming: large sequential downloads",
    templateMix: {
      streamBytes: 0.60,
      apiGet: 0.25,
      htmlPage: 0.10,
      delayResponse: 0.05,
    },
    concurrency: { min: 1, max: 2 },
    delayBetweenRequests: { min: 200, max: 1000 },
    burstPattern: {
      burstSize: { min: 1, max: 2 },
      pauseBetweenBursts: { min: 3000, max: 10000 },
    },
    rampUpMs: 5000,
  },

  "api-heavy": {
    description: "Simulates an API-heavy client (mobile app / SPA)",
    templateMix: {
      apiGet: 0.35,
      apiPost: 0.25,
      apiPut: 0.15,
      apiDelete: 0.10,
      delayResponse: 0.10,
      htmlPage: 0.05,
    },
    concurrency: { min: 5, max: 10 },
    delayBetweenRequests: { min: 10, max: 100 },
    burstPattern: {
      burstSize: { min: 10, max: 30 },
      pauseBetweenBursts: { min: 500, max: 2000 },
    },
    rampUpMs: 1000,
  },

  "social-media": {
    description: "Simulates social media: image-heavy scrolling",
    templateMix: {
      staticImage: 0.35,
      apiGet: 0.30,
      apiPost: 0.15,
      htmlPage: 0.10,
      streamBytes: 0.05,
      delayResponse: 0.05,
    },
    concurrency: { min: 4, max: 8 },
    delayBetweenRequests: { min: 20, max: 300 },
    burstPattern: {
      burstSize: { min: 5, max: 15 },
      pauseBetweenBursts: { min: 2000, max: 8000 },
    },
    rampUpMs: 2000,
  },

  general: {
    description: "Balanced general-purpose traffic",
    templateMix: {
      htmlPage: 0.15,
      staticImage: 0.15,
      apiGet: 0.30,
      apiPost: 0.15,
      apiPut: 0.05,
      apiDelete: 0.05,
      streamBytes: 0.05,
      gzipResponse: 0.05,
      delayResponse: 0.05,
    },
    concurrency: { min: 3, max: 6 },
    delayBetweenRequests: { min: 30, max: 400 },
    burstPattern: {
      burstSize: { min: 4, max: 12 },
      pauseBetweenBursts: { min: 1000, max: 4000 },
    },
    rampUpMs: 3000,
  },

  "quick-check": {
    description: "Minimal requests for fast latency check",
    templateMix: {
      apiGet: 0.6,
      htmlPage: 0.2,
      delayResponse: 0.2,
    },
    concurrency: { min: 1, max: 1 },
    delayBetweenRequests: { min: 100, max: 200 },
    burstPattern: {
      burstSize: { min: 1, max: 3 },
      pauseBetweenBursts: { min: 500, max: 1000 },
    },
    rampUpMs: 0,
  },

  // ── Local profiles (target localhost test server) ──────────
  "local-quick": {
    description: "Quick check against local test server",
    templateMix: {
      localApiGet: 0.4,
      localHtml: 0.2,
      localDelay: 0.2,
      localStream: 0.2,
    },
    concurrency: { min: 1, max: 2 },
    delayBetweenRequests: { min: 10, max: 100 },
    burstPattern: {
      burstSize: { min: 2, max: 5 },
      pauseBetweenBursts: { min: 200, max: 800 },
    },
    rampUpMs: 0,
  },

  "local-general": {
    description: "General traffic against local test server",
    templateMix: {
      localApiGet: 0.20,
      localApiPost: 0.15,
      localHtml: 0.15,
      localStatic: 0.15,
      localStream: 0.15,
      localDelay: 0.10,
      localGzip: 0.05,
      localError: 0.05,
    },
    concurrency: { min: 2, max: 4 },
    delayBetweenRequests: { min: 10, max: 200 },
    burstPattern: {
      burstSize: { min: 3, max: 10 },
      pauseBetweenBursts: { min: 300, max: 1500 },
    },
    rampUpMs: 1000,
  },

  "local-download-heavy": {
    description: "Large downloads and chunked transfers against local test server",
    templateMix: {
      localDownload: 0.40,
      localChunked: 0.30,
      localApiGet: 0.10,
      localDelay: 0.10,
      localHtml: 0.10,
    },
    concurrency: { min: 1, max: 2 },
    delayBetweenRequests: { min: 50, max: 300 },
    burstPattern: {
      burstSize: { min: 2, max: 5 },
      pauseBetweenBursts: { min: 700, max: 2000 },
    },
    rampUpMs: 1000,
  },

  "local-session-churn": {
    description: "Short-lived mixed sessions and reconnect-style request bursts",
    templateMix: {
      localPage: 0.20,
      localApiGet: 0.20,
      localApiPost: 0.15,
      localDownload: 0.10,
      localStatic: 0.10,
      localDelay: 0.10,
      localError: 0.10,
      localHtml: 0.05,
    },
    concurrency: { min: 4, max: 8 },
    delayBetweenRequests: { min: 5, max: 60 },
    burstPattern: {
      burstSize: { min: 8, max: 24 },
      pauseBetweenBursts: { min: 200, max: 900 },
    },
    rampUpMs: 500,
  },
};

/**
 * Build a set of local request templates keyed on a base URL.
 * Uses the local test server endpoints instead of httpbin.org.
 */
function buildLocalTemplates(baseUrl) {
  const b = baseUrl.replace(/\/$/, "");
  return {
    localHtml: {
      urls: [`${b}/html`, `${b}/`],
      method: "GET",
      weight: 3,
    },
    localApiGet: {
      urls: [
        `${b}/api/status`,
        `${b}/api/user`,
        `${b}/api/uuid`,
        `${b}/api/headers`,
      ],
      method: "GET",
      headers: { Accept: "application/json" },
      weight: 5,
    },
    localApiPost: {
      urls: [`${b}/api/echo`],
      method: "POST",
      body: JSON.stringify({ test: true, ts: Date.now() }),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      weight: 2,
    },
    localStatic: {
      urls: [`${b}/static/app.js`, `${b}/static/style.css`],
      method: "GET",
      weight: 2,
    },
    localStream: {
      urls: [`${b}/stream/1024`, `${b}/stream/4096`, `${b}/stream/16384`],
      method: "GET",
      weight: 1,
    },
    localChunked: {
      urls: [
        `${b}/stream/chunked/262144?chunk=16384&delay=5`,
        `${b}/stream/chunked/524288?chunk=32768&delay=8`,
        `${b}/stream/chunked/1048576?chunk=65536&delay=10`,
      ],
      method: "GET",
      weight: 1,
    },
    localDownload: {
      urls: [
        `${b}/download/131072`,
        `${b}/download/524288`,
        `${b}/download/1048576`,
      ],
      method: "GET",
      weight: 1,
    },
    localPage: {
      urls: [
        `${b}/page/news`,
        `${b}/page/feed`,
        `${b}/page/store/catalog`,
        `${b}/page/video`,
      ],
      method: "GET",
      weight: 1,
    },
    localDelay: {
      urls: [`${b}/delay/0`, `${b}/delay/50`, `${b}/delay/100`],
      method: "GET",
      weight: 1,
    },
    localGzip: {
      urls: [`${b}/gzip`],
      method: "GET",
      headers: { "Accept-Encoding": "gzip, deflate" },
      weight: 1,
    },
    localError: {
      urls: [`${b}/error/400`, `${b}/error/500`],
      method: "GET",
      weight: 1,
    },
  };
}

class BehaviorProfile {
  /**
   * Get a built-in profile by name, or validate a custom profile object.
   *
   * @param {string|Object} nameOrConfig
   * @returns {Object} resolved profile
   */
  static create(nameOrConfig, options = {}) {
    if (typeof nameOrConfig === "string") {
      const def = PROFILE_DEFINITIONS[nameOrConfig];
      if (!def) {
        throw new Error(
          `Unknown profile: ${nameOrConfig}. Available: ${Object.keys(PROFILE_DEFINITIONS).join(", ")}`
        );
      }

      // Detect local profiles by prefix
      const isLocal = nameOrConfig.startsWith("local-");
      const baseUrl = options.baseUrl || "http://127.0.0.1:3099";

      return {
        name: nameOrConfig,
        ...def,
        templates: isLocal
          ? { ...REQUEST_TEMPLATES, ...buildLocalTemplates(baseUrl) }
          : REQUEST_TEMPLATES,
        baseUrl: isLocal ? baseUrl : undefined,
      };
    }

    // Custom profile object
    const custom = nameOrConfig;
    if (!custom.templateMix) {
      throw new Error("Custom profile must include 'templateMix'");
    }
    return {
      name: custom.name || "custom",
      description: custom.description || "Custom traffic profile",
      templateMix: custom.templateMix,
      concurrency: custom.concurrency || { min: 1, max: 3 },
      delayBetweenRequests: custom.delayBetweenRequests || { min: 50, max: 500 },
      burstPattern: custom.burstPattern || {
        burstSize: { min: 1, max: 5 },
        pauseBetweenBursts: { min: 1000, max: 3000 },
      },
      rampUpMs: custom.rampUpMs || 2000,
      templates: REQUEST_TEMPLATES,
    };
  }

  /** List available built-in profile names. */
  static listProfiles() {
    return Object.keys(PROFILE_DEFINITIONS).map((name) => ({
      name,
      description: PROFILE_DEFINITIONS[name].description,
    }));
  }

  /** Get the list of URL targets for this profile (used by Puppeteer tests). */
  static getTargetUrls(profile, baseUrl) {
    const urls = new Set();
    const templates = profile.templates;

    if (baseUrl) {
      // For local profiles, use the baseUrl
      urls.add(`${baseUrl}/`);
      urls.add(`${baseUrl}/html`);
      return [...urls];
    }

    for (const [key, weight] of Object.entries(profile.templateMix)) {
      const template = templates[key];
      if (template && template.urls) {
        for (const url of template.urls) {
          if (!url.includes("delay/") && !url.includes("stream-bytes/") && !url.includes("error/")) {
            urls.add(url);
          }
        }
      }
    }
    return [...urls].slice(0, 5); // top 5 unique URLs for browser tests
  }
}

module.exports = { BehaviorProfile, REQUEST_TEMPLATES, PROFILE_DEFINITIONS };
