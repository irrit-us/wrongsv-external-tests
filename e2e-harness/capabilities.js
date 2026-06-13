const SERVER_DEFECTS = {
  "server.v2ray_meek_transport": {
    id: "server.v2ray_meek_transport",
    title: "wrongsv lacks V2Ray Meek transport support",
    severity: "medium",
    detail:
      "V2Fly documents Meek as a client transport, but wrongsv has no server-side Meek implementation.",
  },
  "server.v2ray_tlsmirror_transport": {
    id: "server.v2ray_tlsmirror_transport",
    title: "wrongsv lacks V2Ray TLSMirror transport support",
    severity: "medium",
    detail:
      "V2Fly documents TLSMirror transport, but wrongsv has no server-side TLSMirror implementation.",
  },
  "server.v2ray_docs_transport": {
    id: "server.v2ray_docs_transport",
    title: "wrongsv lacks V2Ray Google Docs Viewer transport support",
    severity: "low",
    detail:
      "V2Fly documents the Google Docs Viewer transport, but wrongsv has no corresponding server implementation.",
  },
  "server.mihomo_wireguard_protocol": {
    id: "server.mihomo_wireguard_protocol",
    title: "wrongsv lacks WireGuard server-side support",
    severity: "medium",
    detail:
      "Mihomo-class clients expose WireGuard support, but wrongsv does not implement a WireGuard inbound/proxy mode.",
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
      "hysteria2_tcp",
      "tuic_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: ["server.mihomo_wireguard_protocol"],
    scenarioDefects: {},
    harnessGaps: ["vless_quic", "vless_kcp"],
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
      "hysteria2_tcp",
      "tuic_tcp",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: ["server.mihomo_wireguard_protocol"],
    scenarioDefects: {},
    harnessGaps: ["vless_quic", "vless_kcp"],
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
  },
  v2ray: {
    label: "V2Ray / V2Fly",
    engine: "v2ray-core",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_ws_tcp",
      "vless_grpc",
      "vless_kcp",
      "shadowsocks_aead",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [
      "server.v2ray_meek_transport",
      "server.v2ray_tlsmirror_transport",
      "server.v2ray_docs_transport",
    ],
    scenarioDefects: {},
    harnessGaps: ["trojan_tls", "vless_quic", "shadowsocks_2022", "vless_httpupgrade"],
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
  SERVER_DEFECTS,
  getClientCapability,
};
