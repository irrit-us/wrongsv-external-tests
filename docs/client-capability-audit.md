# Client Capability Audit

This audit pivots protocol coverage around what the client can actually do,
then classifies the outcome as one of:

- `covered`: wrongsv + harness + client interoperate
- `server defect`: the client capability exists, but wrongsv fails to interoperate
- `harness gap`: the capability exists and wrongsv may support it, but the external harness
  does not yet emit a valid runtime config or launch path for that client version

## Capability Basis

- clash-verge-rev official repo: GUI shell that manages Mihomo / sing-box / Xray kernels  
  `https://github.com/clash-verge-rev/clash-verge-rev`
- Mihomo capability references: VLESS transport docs, Shadowsocks docs, Trojan docs, Hysteria2/TUIC docs  
  `https://wiki.metacubex.one/en/config/proxies/vless/`  
  `https://wiki.metacubex.one/en/config/proxies/transport/`  
  `https://wiki.metacubex.one/en/config/proxies/ss/`  
  `https://wiki.metacubex.one/en/config/proxies/trojan/`
- V2Fly / V2Ray capability references: VLESS, Shadowsocks, Trojan, WebSocket, gRPC, KCP, QUIC docs  
  `https://www.v2fly.org/en_US/v5/config/proxy/vless.html`  
  `https://www.v2fly.org/en_US/v5/config/proxy/shadowsocks.html`  
  `https://www.v2fly.org/en_US/v5/config/proxy/trojan.html`

## Executed Matrices

### clash-verge-rev (Mihomo core path)

Runtime path: Mihomo core via [run-client-matrix.js](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/run-client-matrix.js)  
Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.json), [matrix.md](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.md)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_httpupgrade`, `shadowsocks_aead`,
  `shadowsocks_2022`, `trojan_tls`
- Server defects:
  `vmess_standard` confirmed wrongsv's custom VMess dialect mismatch
  `vless_grpc` failed against wrongsv
  `vless_xhttp` failed against wrongsv
- Harness gaps:
  `vless_quic`, `vless_kcp`, `hysteria2`, `tuic`

### sing-box

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-matrix-2/matrix.json), [quic check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-quic-check-2/matrix.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_quic`,
  `shadowsocks_2022`, `trojan_tls`
- Server defects:
  `vmess_standard` confirmed wrongsv's custom VMess dialect mismatch
  `vless_xhttp` failed against wrongsv
- Harness gaps:
  `anytls`, `shadowtls`, `hysteria2`, `tuic`

### xray-core

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-matrix/matrix.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `shadowsocks_2022`
- Server defects:
  `vmess_standard` confirmed wrongsv's custom VMess dialect mismatch
  `vless_grpc` is unstable against wrongsv: first probe may pass, follow-on requests fail
- Harness gaps:
  `vless_kcp` currently blocked by xray 26.5.9 config migration (`mkcp header & seed` removal)
  `vless_tls_tcp`, `trojan_tls`, `vless_quic`

### V2Ray / V2Fly

Result files: [core matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-matrix-check-2/matrix.json), [extra checks](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-extra-check/matrix.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `shadowsocks_aead`
- Server defects:
  `vmess_standard` confirmed wrongsv's custom VMess dialect mismatch
  `vless_grpc` is unstable against wrongsv
- Not a server defect:
  `vless_httpupgrade` is not accepted by the tested V2Ray 5.49.0 binary, so it was removed
  from the runnable capability set
- Harness gaps:
  `trojan_tls`, `vless_quic`, `shadowsocks_2022`, `vless_kcp`

## Confirmed Server Defects

- `server.vmess_standard_interop`
  Standard VMess-capable clients fail because wrongsv is not wire-compatible with
  the v2fly/xray VMess dialect.
- `server.mihomo_grpc_interop`
  Mihomo-backed clients can select the gRPC carrier, but wrongsv does not maintain
  a stable HTTP/2/gRPC exchange.
- `server.mihomo_xhttp_interop`
  Mihomo-backed clients can select XHTTP, but wrongsv does not successfully
  negotiate the transport.
- `server.singbox_xhttp_interop`
  sing-box reaches the XHTTP endpoint, but wrongsv returns malformed/aborted
  HTTP/2 behavior.
- `server.xray_grpc_interop`
  xray-core can connect to the gRPC carrier, but compatibility probes do not stay healthy.
- `server.v2ray_grpc_interop`
  V2Ray/V2Fly can initiate the gRPC carrier, but compatibility probes fail after the first connection.
- `server.mihomo_wireguard_protocol`
  Mihomo-class clients expose WireGuard support, but wrongsv still has no WireGuard server-side mode.
- `server.v2ray_meek_transport`
  V2Fly documents Meek transport, but wrongsv has no server-side Meek implementation.
- `server.v2ray_tlsmirror_transport`
  V2Fly documents TLSMirror transport, but wrongsv has no server-side TLSMirror implementation.
- `server.v2ray_docs_transport`
  V2Fly documents the Google Docs Viewer transport, but wrongsv has no corresponding server implementation.
