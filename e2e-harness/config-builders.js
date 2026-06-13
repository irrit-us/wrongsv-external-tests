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

function buildMihomoShellConfig(proxy, options = {}) {
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
  if (options.debugController) {
    config["external-controller"] =
      `${options.debugController.host}:${options.debugController.port}`;
    config.secret = options.debugController.secret;
  }
  return toYaml(config);
}

function buildMihomoRuntimeConfig(rawConfig, options = {}) {
  const proxy = parseJson(rawConfig);
  return buildMihomoShellConfig(proxy, options);
}

function buildMihomoShadowsocksRuntimeConfig(scenario, options = {}) {
  return buildMihomoShellConfig(
    {
      name: options.clientName || "wrongsv",
      type: "ss",
      server: "127.0.0.1",
      port: options.serverPort || scenario.serverPort,
      cipher: scenario.method,
      password: scenario.password,
      udp: true,
    },
    options
  );
}

function buildMihomoTrojanRuntimeConfig(scenario, options = {}) {
  return buildMihomoShellConfig(
    {
      name: options.clientName || "wrongsv",
      type: "trojan",
      server: "127.0.0.1",
      port: options.serverPort || scenario.serverPort,
      password: scenario.password,
      udp: true,
      sni: scenario.serverName || "localhost",
      "skip-cert-verify": true,
    },
    options
  );
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

function buildXrayShadowsocksRuntimeConfig(scenario, options = {}) {
  const config = {
    log: { loglevel: "warning" },
    inbounds: [
      {
        port: options.socksPort || 10808,
        protocol: "socks",
        listen: "127.0.0.1",
        tag: "socks-in",
        settings: { udp: true },
      },
    ],
    outbounds: [
      {
        protocol: "shadowsocks",
        tag: options.clientName || "wrongsv",
        settings: {
          address: "127.0.0.1",
          port: options.serverPort || scenario.serverPort,
          method: scenario.method,
          password: scenario.password,
        },
      },
      {
        protocol: "freedom",
        tag: "direct",
      },
    ],
    routing: {
      rules: [
        {
          type: "field",
          inboundTag: ["socks-in"],
          outboundTag: options.clientName || "wrongsv",
        },
      ],
    },
  };
  return JSON.stringify(config, null, 2);
}

function buildV2RayShadowsocksRuntimeConfig(scenario, options = {}) {
  const config = {
    log: { loglevel: "warning" },
    inbounds: [
      {
        port: options.socksPort || 10818,
        protocol: "socks",
        listen: "127.0.0.1",
        tag: "socks-in",
        settings: { udp: true },
      },
    ],
    outbounds: [
      {
        protocol: "shadowsocks",
        tag: options.clientName || "wrongsv",
        settings: {
          servers: [
            {
              address: "127.0.0.1",
              port: options.serverPort || scenario.serverPort,
              method: scenario.method,
              password: scenario.password,
            },
          ],
        },
      },
      {
        protocol: "freedom",
        tag: "direct",
      },
    ],
    routing: {
      rules: [
        {
          type: "field",
          inboundTag: ["socks-in"],
          outboundTag: options.clientName || "wrongsv",
        },
      ],
    },
  };
  return JSON.stringify(config, null, 2);
}

function extractSingBoxOutbounds(parsed) {
  if (Array.isArray(parsed?.outbounds)) {
    return parsed.outbounds.map((outbound) => normalizeSingBoxOutbound(outbound));
  }
  if (Array.isArray(parsed?.configs)) {
    return parsed.configs.map((outbound) => normalizeSingBoxOutbound(outbound));
  }
  if (parsed?.type) {
    return [normalizeSingBoxOutbound(parsed)];
  }
  throw new Error("wrongsv sing-box config did not contain outbounds");
}

function normalizeSingBoxOutbound(outbound) {
  const next = clone(outbound);
  if (next.transport?.type === "quic" && next.tls?.utls) {
    delete next.tls.utls;
  }
  return next;
}

function buildSingBoxRuntimeConfig(rawConfig, options = {}) {
  const parsed = parseJson(rawConfig);
  const outbounds = extractSingBoxOutbounds(parsed);
  const primary = outbounds.find((item) => item.tag && item.tag !== "direct") || outbounds[0];
  const finalTag = options.debugController ? "selector" : primary.tag || options.clientName || "wrongsv";
  const nextOutbounds = [...outbounds];
  if (options.debugController) {
    const directTag = nextOutbounds.find((item) => item.tag === "direct")?.tag || "direct";
    nextOutbounds.push({
      type: "selector",
      tag: "selector",
      outbounds: [primary.tag || options.clientName || "wrongsv", directTag],
      default: primary.tag || options.clientName || "wrongsv",
    });
  }
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
    outbounds: nextOutbounds,
    route: {
      auto_detect_interface: false,
      final: finalTag,
    },
  };
  if (options.debugController) {
    config.experimental = {
      clash_api: {
        external_controller: `${options.debugController.host}:${options.debugController.port}`,
        secret: options.debugController.secret,
      },
    };
  }
  return JSON.stringify(config, null, 2);
}

function buildSingBoxShadowsocksRuntimeConfig(scenario, options = {}) {
  const primaryTag = options.clientName || "wrongsv";
  const outbounds = [
    {
      type: "shadowsocks",
      tag: primaryTag,
      server: "127.0.0.1",
      server_port: options.serverPort || scenario.serverPort,
      method: scenario.method,
      password: scenario.password,
    },
  ];
  let finalTag = primaryTag;
  if (options.debugController) {
    outbounds.push({ type: "direct", tag: "direct" });
    outbounds.push({
      type: "selector",
      tag: "selector",
      outbounds: [primaryTag, "direct"],
      default: primaryTag,
    });
    finalTag = "selector";
  }
  const config = {
    log: { level: "warn" },
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
      final: finalTag,
    },
  };
  if (options.debugController) {
    config.experimental = {
      clash_api: {
        external_controller: `${options.debugController.host}:${options.debugController.port}`,
        secret: options.debugController.secret,
      },
    };
  }
  return JSON.stringify(config, null, 2);
}

function buildSingBoxTrojanRuntimeConfig(scenario, options = {}) {
  const primaryTag = options.clientName || "wrongsv";
  const outbounds = [
    {
      type: "trojan",
      tag: primaryTag,
      server: "127.0.0.1",
      server_port: options.serverPort || scenario.serverPort,
      password: scenario.password,
      tls: {
        enabled: true,
        server_name: scenario.serverName || "localhost",
        insecure: true,
      },
    },
  ];
  let finalTag = primaryTag;
  if (options.debugController) {
    outbounds.push({ type: "direct", tag: "direct" });
    outbounds.push({
      type: "selector",
      tag: "selector",
      outbounds: [primaryTag, "direct"],
      default: primaryTag,
    });
    finalTag = "selector";
  }
  const config = {
    log: { level: "warn" },
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
      final: finalTag,
    },
  };
  if (options.debugController) {
    config.experimental = {
      clash_api: {
        external_controller: `${options.debugController.host}:${options.debugController.port}`,
        secret: options.debugController.secret,
      },
    };
  }
  return JSON.stringify(config, null, 2);
}

function buildSingBoxAnytlsRuntimeConfig(scenario, options = {}) {
  const primaryTag = options.clientName || "wrongsv";
  const outbounds = [
    {
      type: "anytls",
      tag: primaryTag,
      server: "127.0.0.1",
      server_port: options.serverPort || scenario.serverPort,
      password: scenario.password,
      tls: {
        enabled: true,
        server_name: scenario.serverName || "localhost",
        insecure: true,
      },
    },
  ];
  let finalTag = primaryTag;
  if (options.debugController) {
    outbounds.push({ type: "direct", tag: "direct" });
    outbounds.push({
      type: "selector",
      tag: "selector",
      outbounds: [primaryTag, "direct"],
      default: primaryTag,
    });
    finalTag = "selector";
  }
  const config = {
    log: { level: "warn" },
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
      final: finalTag,
    },
  };
  if (options.debugController) {
    config.experimental = {
      clash_api: {
        external_controller: `${options.debugController.host}:${options.debugController.port}`,
        secret: options.debugController.secret,
      },
    };
  }
  return JSON.stringify(config, null, 2);
}

function buildSingBoxShadowTlsRuntimeConfig(rawConfig, scenario, options = {}) {
  const parsed = parseJson(rawConfig);
  const outbounds = extractSingBoxOutbounds(parsed);
  const primary = clone(
    outbounds.find((item) => item.tag && item.tag !== "direct") || outbounds[0]
  );
  if (!primary) {
    throw new Error("wrongsv sing-box config did not contain a primary outbound");
  }

  const detourTag = options.detourTag || `${options.clientName || "wrongsv"}-shadowtls`;
  delete primary.tls;
  primary.detour = detourTag;

  const nextOutbounds = outbounds.map((outbound) =>
    outbound.tag === primary.tag ? primary : outbound
  );
  nextOutbounds.push({
    type: "shadowtls",
    tag: detourTag,
    server: "127.0.0.1",
    server_port: options.serverPort || scenario.serverPort,
    version: 3,
    password: scenario.password,
    tls: {
      enabled: true,
      server_name: scenario.serverName || "localhost",
      insecure: true,
    },
  });

  let finalTag = primary.tag || options.clientName || "wrongsv";
  if (options.debugController) {
    const directTag = nextOutbounds.find((item) => item.tag === "direct")?.tag || "direct";
    if (!nextOutbounds.find((item) => item.tag === directTag)) {
      nextOutbounds.push({ type: "direct", tag: directTag });
    }
    nextOutbounds.push({
      type: "selector",
      tag: "selector",
      outbounds: [finalTag, directTag],
      default: finalTag,
    });
    finalTag = "selector";
  }

  const config = {
    log: { level: "warn" },
    inbounds: [
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: options.mixedPort || 10809,
      },
    ],
    outbounds: nextOutbounds,
    route: {
      auto_detect_interface: false,
      final: finalTag,
    },
  };
  if (options.debugController) {
    config.experimental = {
      clash_api: {
        external_controller: `${options.debugController.host}:${options.debugController.port}`,
        secret: options.debugController.secret,
      },
    };
  }
  return JSON.stringify(config, null, 2);
}

function buildHiddifyRuntimeConfig(rawConfig, options = {}) {
  return buildSingBoxRuntimeConfig(rawConfig, options);
}

function buildClientRuntimeConfig({ client, rawConfig, clientName, scenario, serverPort }) {
  const family = scenario?.family || "vless";
  switch (client) {
    case "flclash":
    case "clash-verge-rev":
      if (family === "shadowsocks") {
        return {
          extension: ".yaml",
          content: buildMihomoShadowsocksRuntimeConfig(scenario, {
            mixedPort: 7890,
            clientName,
            serverPort,
            debugController:
              client === "clash-verge-rev"
                ? { host: "127.0.0.1", port: 19090, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      if (family === "trojan") {
        return {
          extension: ".yaml",
          content: buildMihomoTrojanRuntimeConfig(scenario, {
            mixedPort: 7890,
            clientName,
            serverPort,
            debugController:
              client === "clash-verge-rev"
                ? { host: "127.0.0.1", port: 19090, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      return {
        extension: ".yaml",
        content: buildMihomoRuntimeConfig(rawConfig, {
          mixedPort: 7890,
          clientName,
          debugController:
            client === "clash-verge-rev"
              ? { host: "127.0.0.1", port: 19090, secret: "wrongsv-debug" }
              : undefined,
        }),
      };
    case "hiddify":
      if (family === "shadowsocks") {
        return {
          extension: ".json",
          content: buildSingBoxShadowsocksRuntimeConfig(scenario, {
            mixedPort: 12334,
            clientName,
            serverPort,
          }),
        };
      }
      if (family === "trojan") {
        return {
          extension: ".json",
          content: buildSingBoxTrojanRuntimeConfig(scenario, {
            mixedPort: 12334,
            clientName,
            serverPort,
          }),
        };
      }
      if (family === "anytls") {
        return {
          extension: ".json",
          content: buildSingBoxAnytlsRuntimeConfig(scenario, {
            mixedPort: 12334,
            clientName,
            serverPort,
          }),
        };
      }
      if (family === "shadowtls") {
        return {
          extension: ".json",
          content: buildSingBoxShadowTlsRuntimeConfig(rawConfig, scenario, {
            mixedPort: 12334,
            clientName,
            serverPort,
          }),
        };
      }
      return {
        extension: ".json",
        content: buildHiddifyRuntimeConfig(rawConfig, {
          mixedPort: 12334,
          clientName,
        }),
      };
    case "sing-box":
      if (family === "shadowsocks") {
        return {
          extension: ".json",
          content: buildSingBoxShadowsocksRuntimeConfig(scenario, {
            mixedPort: 10809,
            clientName,
            serverPort,
            debugController:
              client === "sing-box"
                ? { host: "127.0.0.1", port: 19091, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      if (family === "trojan") {
        return {
          extension: ".json",
          content: buildSingBoxTrojanRuntimeConfig(scenario, {
            mixedPort: 10809,
            clientName,
            serverPort,
            debugController:
              client === "sing-box"
                ? { host: "127.0.0.1", port: 19091, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      if (family === "anytls") {
        return {
          extension: ".json",
          content: buildSingBoxAnytlsRuntimeConfig(scenario, {
            mixedPort: 10809,
            clientName,
            serverPort,
            debugController:
              client === "sing-box"
                ? { host: "127.0.0.1", port: 19091, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      if (family === "shadowtls") {
        return {
          extension: ".json",
          content: buildSingBoxShadowTlsRuntimeConfig(rawConfig, scenario, {
            mixedPort: 10809,
            clientName,
            serverPort,
            debugController:
              client === "sing-box"
                ? { host: "127.0.0.1", port: 19091, secret: "wrongsv-debug" }
                : undefined,
          }),
        };
      }
      return {
        extension: ".json",
        content: buildSingBoxRuntimeConfig(rawConfig, {
          mixedPort: 10809,
          clientName,
          debugController:
            client === "sing-box"
              ? { host: "127.0.0.1", port: 19091, secret: "wrongsv-debug" }
              : undefined,
        }),
      };
    case "xray-core":
      if (family === "shadowsocks") {
        return {
          extension: ".json",
          content: buildXrayShadowsocksRuntimeConfig(scenario, {
            socksPort: 10808,
            clientName,
            serverPort,
          }),
        };
      }
      return {
        extension: ".json",
        content: buildXrayRuntimeConfig(rawConfig, {
          socksPort: 10808,
          clientName,
        }),
      };
    case "v2ray":
      if (family === "shadowsocks") {
        return {
          extension: ".json",
          content: buildV2RayShadowsocksRuntimeConfig(scenario, {
            socksPort: 10818,
            clientName,
            serverPort,
          }),
        };
      }
      return {
        extension: ".json",
        content: buildXrayRuntimeConfig(rawConfig, {
          socksPort: 10818,
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
    case "clash-verge-rev":
      return "mihomo";
    case "hiddify":
    case "sing-box":
      return "sing-box";
    case "xray-core":
    case "v2ray":
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
