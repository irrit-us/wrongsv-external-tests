const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const INSPECTION_CACHE = new Map();
const STRINGS_CACHE = new Map();

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function firstExistingBinary(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    try {
      const resolved = execFileSync("bash", ["-lc", `command -v ${JSON.stringify(candidate)}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (resolved) return resolved;
    } catch {}
  }
  return null;
}

function knownCoreCandidates(repoRoot, client) {
  const deployRoot = path.resolve(repoRoot, "..", "test-deploy");
  switch (client) {
    case "sing-box":
      return [
        process.env.SING_BOX_BIN,
        path.join(deployRoot, "sing-box"),
        "/usr/sbin/sing-box",
        "sing-box",
      ];
    case "xray-core":
      return [
        process.env.XRAY_BIN,
        path.join(deployRoot, "xray"),
        "xray",
      ];
    case "v2ray":
      return [
        process.env.V2RAY_BIN,
        path.join(deployRoot, "v2ray"),
        "v2ray",
      ];
    case "clash-verge-rev":
    case "mihomo":
      return [
        process.env.MIHOMO_BIN,
        path.join(deployRoot, "mihomo"),
        "mihomo",
      ];
    default:
      return [];
  }
}

function resolveKnownCoreBinary(repoRoot, client) {
  return firstExistingBinary(knownCoreCandidates(repoRoot, client));
}

function safeExec(binary, args) {
  try {
    return execFileSync(binary, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString?.() || error.stdout || "";
    const stderr = error.stderr?.toString?.() || error.stderr || "";
    return `${stdout}\n${stderr}`.trim();
  }
}

function versionCandidates(client) {
  switch (client) {
    case "sing-box":
      return [["version"]];
    case "xray-core":
      return [["version"], ["-version"]];
    case "v2ray":
      return [["version"]];
    case "clash-verge-rev":
    case "mihomo":
      return [["-v"], ["version"]];
    default:
      return [];
  }
}

function collectVersionOutput(client, binary) {
  for (const args of versionCandidates(client)) {
    const output = safeExec(binary, args);
    if (output) {
      return {
        args,
        output,
      };
    }
  }
  return {
    args: [],
    output: "",
  };
}

function parseVersionInfo(client, output) {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "";

  if (client === "sing-box") {
    const version = first.match(/^sing-box version ([^\s]+)/)?.[1] || null;
    const goVersion = lines.find((line) => line.startsWith("Environment:"))?.match(/(go[0-9.]+)/)?.[1] || null;
    const tagsLine = lines.find((line) => line.startsWith("Tags:")) || "";
    const revision = lines.find((line) => line.startsWith("Revision:"))?.replace("Revision:", "").trim() || null;
    const cgo = lines.find((line) => line.startsWith("CGO:"))?.replace("CGO:", "").trim() || null;
    return {
      product: "sing-box",
      version,
      goVersion,
      tags: tagsLine
        ? tagsLine
            .replace("Tags:", "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      revision,
      cgo,
      firstLine: first,
    };
  }

  if (client === "xray-core") {
    const version = first.match(/^Xray ([^\s]+)/)?.[1] || null;
    const revision = first.match(/\)\s+([0-9a-f]+)\s+\(go/i)?.[1] || null;
    const goVersion = first.match(/\((go[0-9.]+)\s+/)?.[1] || null;
    return {
      product: "xray-core",
      version,
      goVersion,
      revision,
      firstLine: first,
    };
  }

  if (client === "v2ray") {
    const version = first.match(/^V2Ray ([^\s]+)/)?.[1] || null;
    const goVersion = first.match(/\((go[0-9.]+)\s+/)?.[1] || null;
    return {
      product: "v2ray-core",
      version,
      goVersion,
      edition: first.includes("V2Fly") ? "V2Fly" : null,
      firstLine: first,
    };
  }

  if (client === "clash-verge-rev" || client === "mihomo") {
    const version = first.match(/Mihomo Meta (v[^\s]+)/)?.[1] || null;
    const goVersion = first.match(/with (go[0-9.]+)/)?.[1] || null;
    const tagsLine = lines.find((line) => line.startsWith("Use tags:")) || "";
    return {
      product: "mihomo",
      version,
      goVersion,
      tags: tagsLine
        ? tagsLine
            .replace("Use tags:", "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      firstLine: first,
    };
  }

  return {
    product: client,
    version: null,
    firstLine: first,
  };
}

function readStrings(binary) {
  if (STRINGS_CACHE.has(binary)) {
    return STRINGS_CACHE.get(binary);
  }
  let text = "";
  try {
    text = execFileSync("strings", [binary], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {}
  STRINGS_CACHE.set(binary, text);
  return text;
}

function markerPatterns(client) {
  switch (client) {
    case "sing-box":
      return {
        anytls: /github\.com\/anytls\/sing-anytls|github\.com\/sagernet\/sing-box\/protocol\/anytls/,
        shadowtls: /github\.com\/sagernet\/sing-box\/protocol\/shadowtls|github\.com\/sagernet\/sing-shadowtls/,
        hysteria2: /github\.com\/sagernet\/sing-box\/protocol\/hysteria2|github\.com\/sagernet\/sing-quic\/hysteria2/,
        tuic: /github\.com\/sagernet\/sing-box\/protocol\/tuic|github\.com\/sagernet\/sing-quic\/tuic/,
        reality: /RealityConfig|OutboundRealityOptions|github\.com\/sagernet\/sing-box\/common\/tls/,
        grpc: /transport\/v2raygrpclite|V2RayGRPCOptions|GRPCOptions/,
        httpupgrade: /transport\/v2rayhttpupgrade|V2RayHTTPUpgradeOptions|HTTPUpgradeOptions/,
        xhttp: /transport\/v2rayhttp|V2RayHTTPOptions/,
      };
    case "xray-core":
      return {
        vless: /github\.com\/xtls\/xray-core\/proxy\/vless\/outbound|github\.com\/xtls\/xray-core\/proxy\/vless/,
        vmess: /github\.com\/xtls\/xray-core\/proxy\/vmess\/outbound|github\.com\/xtls\/xray-core\/proxy\/vmess/,
        trojan: /github\.com\/xtls\/xray-core\/proxy\/trojan/,
        shadowsocks2022: /github\.com\/xtls\/xray-core\/proxy\/shadowsocks_2022|shadowsocks_2022\.x/,
        websocket: /github\.com\/xtls\/xray-core\/transport\/internet\/websocket|websocket\.x/,
        grpc: /github\.com\/xtls\/xray-core\/transport\/internet\/grpc|grpc\.x/,
        httpupgrade: /github\.com\/xtls\/xray-core\/transport\/internet\/httpupgrade|httpupgrade\.x/,
        xhttp: /github\.com\/xtls\/xray-core\/transport\/internet\/splithttp|splithttp\.x/,
        kcp: /github\.com\/xtls\/xray-core\/transport\/internet\/kcp|\*kcp\./,
        quic: /github\.com\/xtls\/xray-core\/transport\/internet\/quic|QUICListener|ServeQUICConn/,
        reality: /github\.com\/xtls\/xray-core\/transport\/internet\/reality|github\.com\/xtls\/reality|reality\.x/,
      };
    case "v2ray":
      return {
        vless: /github\.com\/v2fly\/v2ray-core\/v5\/proxy\/vless\/outbound/,
        vmess: /github\.com\/v2fly\/v2ray-core\/v5\/proxy\/vmess\/outbound/,
        trojan: /github\.com\/v2fly\/v2ray-core\/v5\/proxy\/trojan/,
        shadowsocks2022: /github\.com\/v2fly\/v2ray-core\/v5\/proxy\/shadowsocks2022/,
        websocket: /github\.com\/v2fly\/v2ray-core\/v5\/transport\/internet\/websocket/,
        grpc: /github\.com\/v2fly\/v2ray-core\/v5\/transport\/internet\/grpc/,
        httpupgrade: /github\.com\/v2fly\/v2ray-core\/v5\/transport\/internet\/httpupgrade/,
        quic: /github\.com\/v2fly\/v2ray-core\/v5\/transport\/internet\/quic/,
        meek: /github\.com\/v2fly\/v2ray-core\/v5\/transport\/internet\/request\/stereotype\/meek/,
        wireguard: /github\.com\/v2fly\/v2ray-core\/v5\/proxy\/wireguard\/outbound/,
      };
    case "clash-verge-rev":
    case "mihomo":
      return {
        anytls: /github\.com\/metacubex\/mihomo\/(listener|transport)\/anytls/,
        shadowtls: /github\.com\/metacubex\/mihomo\/transport\/sing-shadowtls/,
        hysteria2: /github\.com\/metacubex\/mihomo\/listener\/(sing_hysteria2|hysteria2_realm)/,
        tuic: /github\.com\/metacubex\/mihomo\/(listener|transport)\/tuic/,
        reality: /github\.com\/metacubex\/mihomo\/listener\/reality/,
        trojan: /github\.com\/metacubex\/mihomo\/(listener|transport)\/trojan/,
        kcp: /github\.com\/metacubex\/mihomo\/transport\/kcptun/,
        vless: /github\.com\/metacubex\/mihomo\/transport\/vless/,
      };
    default:
      return {};
  }
}

function detectMarkers(client, stringsText, versionInfo) {
  const patterns = markerPatterns(client);
  const markers = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    markers[name] = pattern.test(stringsText);
  }
  if (client === "sing-box" && Array.isArray(versionInfo.tags)) {
    markers.withQuicBuildTag = versionInfo.tags.includes("with_quic");
    markers.withClashApiBuildTag = versionInfo.tags.includes("with_clash_api");
  }
  if ((client === "clash-verge-rev" || client === "mihomo") && Array.isArray(versionInfo.tags)) {
    markers.withGvisorBuildTag = versionInfo.tags.includes("with_gvisor");
  }
  return markers;
}

function inspectCoreBinary(options) {
  const client = options.client;
  const binary = options.binary;
  if (!binary || !fs.existsSync(binary)) {
    return {
      client,
      available: false,
      binary: binary || "",
    };
  }

  const cacheKey = `${client}:${binary}`;
  if (INSPECTION_CACHE.has(cacheKey)) {
    return INSPECTION_CACHE.get(cacheKey);
  }

  const stat = fs.statSync(binary);
  const buffer = fs.readFileSync(binary);
  const versionCommand = collectVersionOutput(client, binary);
  const versionInfo = parseVersionInfo(client, versionCommand.output);
  const stringsText = readStrings(binary);
  const featureMarkers = detectMarkers(client, stringsText, versionInfo);
  const inspection = {
    client,
    available: true,
    binary,
    file: {
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256: sha256(buffer),
    },
    versionCommand,
    versionInfo,
    featureMarkers,
    detectedFeatures: Object.entries(featureMarkers)
      .filter(([, value]) => value === true)
      .map(([name]) => name)
      .sort(),
  };
  INSPECTION_CACHE.set(cacheKey, inspection);
  return inspection;
}

function inspectKnownCoreClients(repoRoot, clients) {
  return clients.map((client) => {
    const binary = resolveKnownCoreBinary(repoRoot, client);
    return inspectCoreBinary({ client, binary });
  });
}

module.exports = {
  inspectCoreBinary,
  inspectKnownCoreClients,
  resolveKnownCoreBinary,
};
