const path = require("path");

const VLESS_TRANSPORT_SCENARIOS = {
  websocket: "vless_ws_tcp",
  httpupgrade: "vless_httpupgrade",
  grpc: "vless_grpc",
  xhttp: "vless_xhttp",
  meek: "vless_meek",
  gdocsviewer: "vless_gdocsviewer",
  webtransport: "vless_webtransport",
  quic: "vless_quic",
  kcp: "vless_kcp",
};

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
      rawFormatByClient: {
        hiddify: "hiddify",
      },
    },
    vless_meek: {
      id: "vless_meek",
      label: "VLESS Meek",
      family: "vless",
      configPath: config("meek.toml"),
      serverName: "localhost",
      meekPath: "/meek",
      tlsPin: "89Frfi0UHw7pCqP0ikybxf27wLnrM0UpfVHQ0oj/o3Y=",
      manualRuntimeByClient: {
        v2ray: "meek",
      },
    },
    vless_gdocsviewer: {
      id: "vless_gdocsviewer",
      label: "VLESS Google Docs Viewer",
      family: "vless",
      configPath: config("gdocsviewer.toml"),
      serverName: "localhost",
      gdocsPath: "/gdocsviewer",
      manualRuntimeByClient: {
        v2ray: "gdocsviewer",
      },
    },
    wireguard_tunnel_http: {
      id: "wireguard_tunnel_http",
      label: "WireGuard tunnel service",
      family: "wireguard",
      configPath: config("wireguard.toml"),
      listenProtocol: "udp",
      targetPort: 3300,
      targetBaseUrl: "http://10.66.66.1:8080",
      serverPublicKey: "V/WCu1yRZ8sMQ6cv4IA5EN9rvD8aOjxDl9dPoJ1+BhI=",
      clientPrivateKey: "6D5AXLjT/KiUZxP92lk9B1zlf7R9x2Xp5a04FdknUEI=",
      allowedIps: ["10.66.66.1/32"],
      clientIp: "10.66.66.2/32",
      mtu: 1400,
      manualRuntimeByClient: {
        flclash: "wireguard",
        "clash-verge-rev": "wireguard",
      },
    },
    vless_quic: {
      id: "vless_quic",
      label: "VLESS QUIC",
      family: "vless",
      configPath: config("quic.toml"),
      serverName: "localhost",
      listenProtocol: "udp",
    },
    vless_webtransport: {
      id: "vless_webtransport",
      label: "VLESS WebTransport",
      family: "vless",
      configPath: config("webtransport.toml"),
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
    snell_tcp: {
      id: "snell_tcp",
      label: "Snell v1 TCP CONNECT",
      family: "snell",
      configPath: config("snell.toml"),
      serverPort: 443,
      psk: "change-this-snell-psk",
      version: 1,
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
    anytls_tcp: {
      id: "anytls_tcp",
      label: "AnyTLS TCP",
      family: "anytls",
      configPath: config("anytls-tcp.toml"),
      serverPort: 443,
      password: "your-secure-password",
      serverName: "localhost",
    },
    naive_tcp: {
      id: "naive_tcp",
      label: "Naive HTTP/2 CONNECT",
      family: "naive",
      configPath: config("naive.toml"),
      serverPort: 443,
      username: "alice",
      password: "change-this-password",
      serverName: "localhost",
      paddingHeaderName: "Padding",
    },
    shadowtls_tcp: {
      id: "shadowtls_tcp",
      label: "ShadowTLS TCP",
      family: "shadowtls",
      configPath: config("shadowtls.toml"),
      serverPort: 443,
      password: "your-shadowtls-password",
      serverName: "localhost",
    },
    hysteria2_tcp: {
      id: "hysteria2_tcp",
      label: "Hysteria2",
      family: "hysteria2",
      configPath: config("hysteria2.toml"),
      serverPort: 443,
      password: "alice:alice-password",
      serverName: "localhost",
      listenProtocol: "udp",
    },
    tuic_tcp: {
      id: "tuic_tcp",
      label: "TUIC",
      family: "tuic",
      configPath: config("tuic.toml"),
      serverPort: 443,
      uuid: "12345678-1234-1234-1234-123456789abc",
      password: "alice-password",
      congestionControl: "cubic",
      heartbeat: "10s",
      serverName: "localhost",
      listenProtocol: "udp",
    },
    vmess_standard: {
      id: "vmess_standard",
      label: "VMess standard client interop",
      family: "vmess",
      configPath: config("vmess.toml"),
      serverName: "localhost",
    },
    lua_tcp: {
      id: "lua_tcp",
      label: "Lua TCP",
      family: "lua",
      configPath: config("lua.toml"),
      serverName: "localhost",
    },
    masque_tcp: {
      id: "masque_tcp",
      label: "Masque TCP",
      family: "masque",
      configPath: config("masque.toml"),
      serverName: "localhost",
    },
    trusttunnel_tcp: {
      id: "trusttunnel_tcp",
      label: "TrustTunnel TCP",
      family: "trusttunnel",
      configPath: config("trusttunnel.toml"),
      serverName: "localhost",
    },
    brook_tcp: {
      id: "brook_tcp",
      label: "Brook TCP",
      family: "brook",
      configPath: config("brook.toml"),
      serverName: "localhost",
    },
    vlite_tcp: {
      id: "vlite_tcp",
      label: "Vlite TCP",
      family: "vlite",
      configPath: config("vlite.toml"),
      serverName: "localhost",
    },
    tor_tcp: {
      id: "tor_tcp",
      label: "Tor TCP",
      family: "tor",
      configPath: config("tor.toml"),
      serverName: "localhost",
    },
    ssh_tcp: {
      id: "ssh_tcp",
      label: "SSH TCP",
      family: "ssh",
      configPath: config("ssh.toml"),
      serverName: "localhost",
    },
    juicity_tcp: {
      id: "juicity_tcp",
      label: "Juicity TCP",
      family: "juicity",
      configPath: config("juicity.toml"),
      serverName: "localhost",
    },
    mieru_tcp: {
      id: "mieru_tcp",
      label: "Mieru TCP",
      family: "mieru",
      configPath: config("mieru.toml"),
      serverName: "localhost",
    },
    sudoku_tcp: {
      id: "sudoku_tcp",
      label: "Sudoku TCP",
      family: "sudoku",
      configPath: config("sudoku.toml"),
      serverName: "localhost",
    },
    vless_encryption_tcp: {
      id: "vless_encryption_tcp",
      label: "VLESS Encryption TCP",
      family: "vless-encryption",
      configPath: config("vless_encryption.toml"),
      serverName: "localhost",
    },
    shadowquic_tcp: {
      id: "shadowquic_tcp",
      label: "ShadowQUIC TCP",
      family: "shadowquic",
      configPath: config("shadowquic.toml"),
      serverName: "localhost",
    },
    anytls_reality_tcp: {
      id: "anytls_reality_tcp",
      label: "AnyTLS Reality TCP",
      family: "anytls-reality",
      configPath: config("anytls_reality.toml"),
      serverName: "localhost",
    },
  };
}

function includes(bucket, value) {
  return Array.isArray(bucket) && bucket.includes(value);
}

function scenarioIdFromResolvedDiagnostics(input) {
  const resolved = input?.resolved || input;
  const active = resolved?.active_components || {};
  const camouflage = active.camouflage || [];
  const performance = active.performance || [];

  switch (resolved?.protocol) {
    case "vless":
      if (includes(camouflage, "anytls")) return "anytls_tcp";
      if (includes(camouflage, "shadowtls")) return "shadowtls_tcp";
      if (resolved.transport && VLESS_TRANSPORT_SCENARIOS[resolved.transport]) {
        return VLESS_TRANSPORT_SCENARIOS[resolved.transport];
      }
      if (resolved.outer_security === "reality") return "vless_reality_vision";
      if (resolved.outer_security === "tls") {
        return includes(performance, "vision") ? "vless_tls_vision" : "vless_tls_tcp";
      }
      return "vless_raw_tcp";
    case "vmess":
      return "vmess_standard";
    case "shadowsocks":
      return resolved.protocol_internal_security === "shadowsocks_2022"
        ? "shadowsocks_2022"
        : "shadowsocks_aead";
    case "snell":
      return "snell_tcp";
    case "trojan":
      return "trojan_tls";
    case "hysteria2":
      return "hysteria2_tcp";
    case "tuic":
      return "tuic_tcp";
    case "wireguard":
      return "wireguard_tunnel_http";
    case "lua":
      return "lua_tcp";
    case "masque":
      return "masque_tcp";
    case "trusttunnel":
      return "trusttunnel_tcp";
    case "brook":
      return "brook_tcp";
    case "vlite":
      return "vlite_tcp";
    case "tor":
      return "tor_tcp";
    case "ssh":
      return "ssh_tcp";
    case "juicity":
      return "juicity_tcp";
    case "mieru":
      return "mieru_tcp";
    case "sudoku":
      return "sudoku_tcp";
    case "vless-encryption":
      return "vless_encryption_tcp";
    case "shadowquic":
      return "shadowquic_tcp";
    case "anytls-reality":
      return "anytls_reality_tcp";
    default:
      return null;
  }
}

module.exports = {
  buildScenarios,
  scenarioIdFromResolvedDiagnostics,
};
