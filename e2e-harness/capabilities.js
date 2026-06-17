const SERVER_DEFECTS = {};

const INTENTIONALLY_UNTRACKED_SCENARIOS = {
  vless_webtransport: {
    reason:
      "scenario is intentionally untracked until a current xray/v2ray-compatible WebTransport client config shape exists and external capability metadata can be added",
  },
};

const CLIENT_CAPABILITIES = {
  flclash: {
    label: "FlClash",
    engine: "mihomo-gui",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_tls_tcp",
      "vless_tls_vision",
      "vless_reality_vision",
      "vless_ws_tcp",
      "vless_httpupgrade",
      "vless_grpc",
      "vless_xhttp",
      "wireguard_tunnel_http",
      "hysteria2_tcp",
      "tuic_tcp",
      "anytls_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [],
    scenarioDefects: {},
    harnessGaps: ["vless_quic", "vless_kcp"],
    harnessGapReasons: {},
  },
  "clash-verge-rev": {
    label: "clash-verge-rev",
    engine: "mihomo-core",
    note:
      "The external harness exercises clash-verge-rev through its Mihomo core path for protocol coverage; GUI-shell behavior is not separately automated.",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_tls_tcp",
      "vless_tls_vision",
      "vless_reality_vision",
      "vless_ws_tcp",
      "vless_httpupgrade",
      "vless_grpc",
      "vless_xhttp",
      "wireguard_tunnel_http",
      "hysteria2_tcp",
      "tuic_tcp",
      "anytls_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [],
    scenarioDefects: {},
    harnessGaps: ["vless_quic", "vless_kcp"],
    harnessGapReasons: {},
  },
  hiddify: {
    label: "Hiddify",
    engine: "sing-box-gui",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_tls_tcp",
      "vless_tls_vision",
      "vless_reality_vision",
      "vless_ws_tcp",
      "vless_httpupgrade",
      "vless_grpc",
      "vless_quic",
      "vless_xhttp",
      "hysteria2_tcp",
      "tuic_tcp",
      "shadowtls_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [],
    scenarioDefects: {},
    harnessGaps: ["anytls_tcp"],
    harnessGapReasons: {
      anytls_tcp:
        "packaged Hiddify core rejected the generated AnyTLS outbound and never exposed the local mixed proxy port",
    },
  },
  "sing-box": {
    label: "sing-box",
    engine: "sing-box-core",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_tls_tcp",
      "vless_tls_vision",
      "vless_reality_vision",
      "vless_ws_tcp",
      "vless_httpupgrade",
      "vless_grpc",
      "vless_quic",
      "vless_xhttp",
      "hysteria2_tcp",
      "tuic_tcp",
      "anytls_tcp",
      "shadowtls_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [],
    scenarioDefects: {},
    harnessGaps: [],
    harnessGapReasons: {},
  },
  "xray-core": {
    label: "xray-core",
    engine: "xray-core",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_reality_vision",
      "vless_ws_tcp",
      "vless_httpupgrade",
      "vless_grpc",
      "vless_xhttp",
      "vless_kcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [],
    scenarioDefects: {},
    harnessGaps: ["vless_tls_tcp", "trojan_tls", "vless_quic"],
    harnessGapReasons: {},
  },
  v2ray: {
    label: "V2Ray / V2Fly",
    engine: "v2ray-core",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_ws_tcp",
      "vless_grpc",
      "vless_meek",
      "vless_gdocsviewer",
      "vless_kcp",
      "shadowsocks_aead",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [
    ],
    scenarioDefects: {},
    harnessGaps: ["trojan_tls", "vless_quic", "shadowsocks_2022", "vless_httpupgrade"],
    harnessGapReasons: {},
  },
};

function getClientCapability(client) {
  const capability = CLIENT_CAPABILITIES[client];
  if (!capability) {
    throw new Error(`Unknown client capability: ${client}`);
  }
  return capability;
}

module.exports = {
  CLIENT_CAPABILITIES,
  INTENTIONALLY_UNTRACKED_SCENARIOS,
  SERVER_DEFECTS,
  getClientCapability,
};
