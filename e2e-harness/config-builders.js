const path = require("path");

function parseJson(text) {
  return typeof text === "string" ? JSON.parse(text) : text;
}

function quoteString(value) {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  if (/^[A-Za-z0-9._:/@+-]+$/.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}[]`;
    }
    return value
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const lines = toYaml(item, indent + 2).split("\n");
          const [first, ...rest] = lines;
          return `${pad}- ${first.trimStart()}\n${rest.join("\n")}`;
        }
        return `${pad}- ${formatScalar(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return `${pad}{}`;
    }
    return entries
      .map(([key, item]) => {
        if (Array.isArray(item) || (item && typeof item === "object")) {
          return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
        }
        return `${pad}${key}: ${formatScalar(item)}`;
      })
      .join("\n");
  }

  return `${pad}${formatScalar(value)}`;
}

function formatScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  return quoteString(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildMihomoRuntimeConfig(rawConfig, options = {}) {
  const proxy = parseJson(rawConfig);
  const proxyName = proxy.name || options.clientName || "wrongsv";
  const config = {
    "mixed-port": options.mixedPort || 7890,
    "allow-lan": false,
    "bind-address": "127.0.0.1",
    mode: "rule",
    "log-level": "info",
    ipv6: false,
    proxies: [proxy],
    "proxy-groups": [
      {
        name: "PROXY",
        type: "select",
        proxies: [proxyName],
      },
    ],
    rules: ["MATCH,PROXY"],
  };
  return toYaml(config);
}

function normalizeXrayOutbound(outbound) {
  const next = clone(outbound);
  if (next.stream_settings && !next.streamSettings) {
    next.streamSettings = next.stream_settings;
    delete next.stream_settings;
  }
  return next;
}

function buildXrayRuntimeConfig(rawConfig, options = {}) {
  const parsed = parseJson(rawConfig);
  const outbounds = (parsed.outbounds || []).map(normalizeXrayOutbound);
  if (outbounds.length === 0) {
    throw new Error("wrongsv xray config did not contain any outbounds");
  }
  const primaryTag = outbounds[0].tag || options.clientName || "wrongsv";
  const config = {
    log: {
      loglevel: "warning",
    },
    inbounds: [
      {
        tag: "socks-in",
        listen: "127.0.0.1",
        port: options.socksPort || 10808,
        protocol: "socks",
        settings: {
          udp: true,
        },
      },
    ],
    outbounds: [
      ...outbounds,
      {
        protocol: "freedom",
        tag: "direct",
      },
    ],
    routing: {
      domainStrategy: "AsIs",
      rules: [
        {
          type: "field",
          inboundTag: ["socks-in"],
          outboundTag: primaryTag,
        },
      ],
    },
  };
  return JSON.stringify(config, null, 2);
}

function extractSingBoxOutbounds(parsed) {
  if (Array.isArray(parsed?.outbounds)) {
    return parsed.outbounds;
  }
  if (Array.isArray(parsed?.configs)) {
    return parsed.configs;
  }
  if (parsed?.type) {
    return [parsed];
  }
  throw new Error("wrongsv sing-box config did not contain outbounds");
}

function buildSingBoxRuntimeConfig(rawConfig, options = {}) {
  const parsed = parseJson(rawConfig);
  const outbounds = extractSingBoxOutbounds(parsed);
  const primary = outbounds.find((item) => item.tag && item.tag !== "direct") || outbounds[0];
  const config = {
    log: {
      level: "warn",
    },
    inbounds: [
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: options.mixedPort || 10809,
      },
    ],
    outbounds,
    route: {
      auto_detect_interface: false,
      final: primary.tag || options.clientName || "wrongsv",
    },
  };
  return JSON.stringify(config, null, 2);
}

function buildHiddifyRuntimeConfig(rawConfig, options = {}) {
  return buildSingBoxRuntimeConfig(rawConfig, options);
}

function buildClientRuntimeConfig({ client, rawConfig, clientName }) {
  switch (client) {
    case "flclash":
      return {
        extension: ".yaml",
        content: buildMihomoRuntimeConfig(rawConfig, {
          mixedPort: 7890,
          clientName,
        }),
      };
    case "hiddify":
      return {
        extension: ".json",
        content: buildHiddifyRuntimeConfig(rawConfig, {
          mixedPort: 12334,
          clientName,
        }),
      };
    case "sing-box":
      return {
        extension: ".json",
        content: buildSingBoxRuntimeConfig(rawConfig, {
          mixedPort: 10809,
          clientName,
        }),
      };
    case "xray-core":
      return {
        extension: ".json",
        content: buildXrayRuntimeConfig(rawConfig, {
          socksPort: 10808,
          clientName,
        }),
      };
    default:
      throw new Error(`Unsupported client for config build: ${client}`);
  }
}

function rawConfigFormat(client) {
  switch (client) {
    case "flclash":
      return "mihomo";
    case "hiddify":
    case "sing-box":
      return "sing-box";
    case "xray-core":
      return "xray";
    default:
      throw new Error(`Unknown client format mapping for ${client}`);
  }
}

function buildTargetCatalog(baseUrl) {
  const b = baseUrl.replace(/\/$/, "");
  return {
    pages: [`${b}/page/news`, `${b}/page/article/1`, `${b}/page/article/2`],
    videoLanding: `${b}/page/video`,
    streams: [
      `${b}/stream/chunked/262144?chunk=16384&delay=5`,
      `${b}/stream/chunked/524288?chunk=32768&delay=8`,
      `${b}/download/1048576`,
    ],
    downloads: [`${b}/download/131072`, `${b}/download/524288`, `${b}/download/1048576`],
    formPage: `${b}/page/form`,
    apiPage: `${b}/page/form`,
    xhrEndpoint: `${b}/api/echo`,
    storeLanding: `${b}/page/store`,
    catalogPage: `${b}/page/store/catalog`,
    productPages: [
      `${b}/page/store/product/1`,
      `${b}/page/store/product/2`,
      `${b}/page/store/product/3`,
    ],
    feedLanding: `${b}/page/feed`,
    feedItems: [
      `${b}/page/feed/item/1`,
      `${b}/page/feed/item/2`,
      `${b}/page/feed/item/3`,
    ],
    multiPageSites: [
      { url: `${b}/page/news`, label: "news", type: "text/html" },
      { url: `${b}/page/feed`, label: "feed", type: "text/html" },
      { url: `${b}/page/store/catalog`, label: "catalog", type: "text/html" },
      { url: `${b}/download/262144`, label: "download-256k", type: "stream" },
      { url: `${b}/gzip`, label: "gzip", type: "gzip" },
      { url: `${b}/delay/1`, label: "delay-1s", type: "delay" },
    ],
    finalCheck: `${b}/api/status`,
    switchingPages: [
      `${b}/page/feed`,
      `${b}/page/article/1`,
      `${b}/page/store/catalog`,
      `${b}/page/form`,
      `${b}/page/video`,
    ],
  };
}

function runtimeConfigPath(outputDir, client, extension) {
  return path.join(outputDir, `${client}-runtime${extension}`);
}

module.exports = {
  buildClientRuntimeConfig,
  buildTargetCatalog,
  rawConfigFormat,
  runtimeConfigPath,
  toYaml,
};
