const path = require("path");

function buildScenarios(wrongsvRepo) {
  const config = (name) => path.join(wrongsvRepo, "configs", name);

  return {
    vless_raw_tcp: {
      id: "vless_raw_tcp",
      label: "VLESS raw TCP",
      family: "vless",
      configPath: config("basic-tcp.toml"),
      serverName: "localhost",
      browserBehavior: "web-browsing",
    },
    vless_tls_tcp: {
      id: "vless_tls_tcp",
      label: "VLESS TLS TCP",
      family: "vless",
      configPath: config("tls-tcp.toml"),
      serverName: "localhost",
      browserBehavior: "web-browsing",
    },
    vless_tls_vision: {
      id: "vless_tls_vision",
      label: "VLESS TLS Vision",
      family: "vless",
      configPath: config("tls-vision.toml"),
      serverName: "localhost",
    },
    vless_reality_vision: {
      id: "vless_reality_vision",
      label: "VLESS REALITY Vision",
      family: "vless",
      configPath: config("reality-vision.toml"),
      serverName: "www.microsoft.com",
      browserBehavior: "web-browsing",
    },
    vless_ws_tcp: {
      id: "vless_ws_tcp",
      label: "VLESS WebSocket",
      family: "vless",
      configPath: config("ws-tcp.toml"),
      serverName: "localhost",
    },
    vless_httpupgrade: {
      id: "vless_httpupgrade",
      label: "VLESS HTTPUpgrade",
      family: "vless",
      configPath: config("httpupgrade.toml"),
      serverName: "localhost",
    },
    vless_grpc: {
      id: "vless_grpc",
      label: "VLESS gRPC",
      family: "vless",
      configPath: config("grpc.toml"),
      serverName: "localhost",
    },
    vless_xhttp: {
      id: "vless_xhttp",
      label: "VLESS XHTTP",
      family: "vless",
      configPath: config("xhttp.toml"),
      serverName: "localhost",
    },
    vless_quic: {
      id: "vless_quic",
      label: "VLESS QUIC",
      family: "vless",
      configPath: config("quic.toml"),
      serverName: "localhost",
      listenProtocol: "udp",
    },
    vless_kcp: {
      id: "vless_kcp",
      label: "VLESS KCP",
      family: "vless",
      configPath: config("kcp.toml"),
      serverName: "localhost",
      listenProtocol: "udp",
    },
    shadowsocks_aead: {
      id: "shadowsocks_aead",
      label: "Shadowsocks AEAD",
      family: "shadowsocks",
      configPath: config("shadowsocks-aead.toml"),
      serverPort: 8388,
      method: "chacha20-ietf-poly1305",
      password: "change-this-password",
      browserBehavior: "web-browsing",
    },
    shadowsocks_2022: {
      id: "shadowsocks_2022",
      label: "Shadowsocks 2022",
      family: "shadowsocks",
      configPath: config("shadowsocks-2022.toml"),
      serverPort: 8388,
      method: "2022-blake3-aes-128-gcm",
      password: "AAAAAAAAAAAAAAAAAAAAAA==",
    },
    trojan_tls: {
      id: "trojan_tls",
      label: "Trojan TLS",
      family: "trojan",
      configPath: config("trojan-tls.toml"),
      serverPort: 443,
      password: "change-me-to-a-long-random-password",
      serverName: "localhost",
      browserBehavior: "web-browsing",
    },
    vmess_standard: {
      id: "vmess_standard",
      label: "VMess standard client interop",
      family: "vmess",
      configPath: config("vmess.toml"),
      serverName: "localhost",
    },
  };
}

module.exports = {
  buildScenarios,
};
