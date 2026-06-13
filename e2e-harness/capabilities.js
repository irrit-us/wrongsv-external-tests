const SERVER_DEFECTS = {
  "server.vmess_standard_interop": {
    id: "server.vmess_standard_interop",
    title: "wrongsv VMess is not wire-compatible with standard clients",
    severity: "high",
    detail:
      "wrongsv's VMess KDF/header handling diverges from the v2fly/xray dialect, so standard VMess-capable clients should be expected to fail until the server implementation is reconciled.",
  },
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
  "server.mihomo_grpc_interop": {
    id: "server.mihomo_grpc_interop",
    title: "wrongsv gRPC carrier is not Mihomo-compatible",
    severity: "high",
    detail:
      "Mihomo-backed clients attempt the gRPC carrier, but wrongsv closes the connection before a stable HTTP/2 request/response flow is established.",
  },
  "server.mihomo_xhttp_interop": {
    id: "server.mihomo_xhttp_interop",
    title: "wrongsv XHTTP carrier is not Mihomo-compatible",
    severity: "high",
    detail:
      "Mihomo-backed clients attempt XHTTP, but wrongsv does not complete a valid HTTP/2 exchange and the VLESS header is never accepted.",
  },
  "server.singbox_xhttp_interop": {
    id: "server.singbox_xhttp_interop",
    title: "wrongsv XHTTP carrier is not sing-box-compatible",
    severity: "high",
    detail:
      "sing-box reaches wrongsv's XHTTP endpoint, but the response path is malformed and compatibility probes fail.",
  },
  "server.xray_grpc_interop": {
    id: "server.xray_grpc_interop",
    title: "wrongsv gRPC carrier is unstable for xray-core",
    severity: "high",
    detail:
      "xray-core can initiate the gRPC outbound, but follow-on probe requests receive empty replies from wrongsv's gRPC path.",
  },
  "server.v2ray_grpc_interop": {
    id: "server.v2ray_grpc_interop",
    title: "wrongsv gRPC carrier is unstable for V2Ray/V2Fly",
    severity: "high",
    detail:
      "V2Ray/V2Fly can initiate the gRPC outbound, but compatibility probes fail after the initial connection because wrongsv does not sustain the expected request flow.",
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
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [
      "server.vmess_standard_interop",
      "server.mihomo_wireguard_protocol",
      "server.mihomo_grpc_interop",
      "server.mihomo_xhttp_interop",
    ],
    scenarioDefects: {
      vless_grpc: "server.mihomo_grpc_interop",
      vless_xhttp: "server.mihomo_xhttp_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["vless_quic", "vless_kcp", "hysteria2", "tuic"],
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
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [
      "server.vmess_standard_interop",
      "server.mihomo_wireguard_protocol",
      "server.mihomo_grpc_interop",
      "server.mihomo_xhttp_interop",
    ],
    scenarioDefects: {
      vless_grpc: "server.mihomo_grpc_interop",
      vless_xhttp: "server.mihomo_xhttp_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["vless_quic", "vless_kcp", "hysteria2", "tuic"],
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
      "vless_xhttp",
      "vless_quic",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: ["server.vmess_standard_interop", "server.singbox_xhttp_interop"],
    scenarioDefects: {
      vless_xhttp: "server.singbox_xhttp_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["anytls", "shadowtls", "hysteria2", "tuic"],
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
      "vless_xhttp",
      "vless_quic",
      "shadowsocks_aead",
      "shadowsocks_2022",
      "trojan_tls",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: ["server.vmess_standard_interop", "server.singbox_xhttp_interop"],
    scenarioDefects: {
      vless_xhttp: "server.singbox_xhttp_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["anytls", "shadowtls", "hysteria2", "tuic"],
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
      "shadowsocks_aead",
      "shadowsocks_2022",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: ["server.vmess_standard_interop", "server.xray_grpc_interop"],
    scenarioDefects: {
      vless_grpc: "server.xray_grpc_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["vless_tls_tcp", "trojan_tls", "vless_quic", "vless_kcp"],
  },
  v2ray: {
    label: "V2Ray / V2Fly",
    engine: "v2ray-core",
    runnableScenarios: [
      "vless_raw_tcp",
      "vless_ws_tcp",
      "vless_grpc",
      "shadowsocks_aead",
      "vmess_standard",
    ],
    browserScenario: "vless_raw_tcp",
    serverDefects: [
      "server.vmess_standard_interop",
      "server.v2ray_meek_transport",
      "server.v2ray_tlsmirror_transport",
      "server.v2ray_docs_transport",
      "server.v2ray_grpc_interop",
    ],
    scenarioDefects: {
      vless_grpc: "server.v2ray_grpc_interop",
      vmess_standard: "server.vmess_standard_interop",
    },
    harnessGaps: ["trojan_tls", "vless_quic", "shadowsocks_2022", "vless_httpupgrade", "vless_kcp"],
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
