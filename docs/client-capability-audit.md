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
Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.json), [matrix.md](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.md), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-grpc-recheck-3/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-vmess-recheck-1/matrix.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_httpupgrade`, `vless_grpc`, `vmess_standard`, `shadowsocks_aead`,
  `shadowsocks_2022`, `trojan_tls`
- `vless_xhttp` now passes after forcing `mode: "stream-one"` in the generated
  Mihomo/Xray-family client config.
- Harness gaps:
  `vless_quic`, `vless_kcp`, `hysteria2`, `tuic`

### sing-box

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-matrix-2/matrix.json), [quic check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-quic-check-2/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-vmess-recheck-1/matrix.json), [AnyTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-anytls-check-3/matrix.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_quic`, `vmess_standard`,
  `anytls_tcp`,
  `shadowsocks_2022`, `trojan_tls`
- `anytls_tcp` now also reports per-user byte and connection deltas after the
  sing-anytls SOCKS5 metrics path was wired into the shared metrics registry.
- Harness gaps:
  `shadowtls`, `hysteria2`, `tuic`, `vless_xhttp`

### Hiddify

Result files: [AnyTLS attempt](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-check-4/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-vmess-recheck-1/matrix.json)

- Covered:
  `vmess_standard`
- Harness gaps:
  `anytls` is still blocked in the packaged Hiddify core on this box:
  its runtime logs reject `type: "anytls"` as an unknown outbound type.
  `shadowtls`, `hysteria2`, `tuic`, `vless_xhttp`

### xray-core

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-matrix/matrix.json), [XHTTP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-xhttp-check-7/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-grpc-recheck-6/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-vmess-recheck-3/matrix.json), [KCP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-kcp-check-2/matrix.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_grpc`, `vless_xhttp`, `vmess_standard`, `shadowsocks_2022`
- `vless_xhttp` now passes after wrongsv added plaintext HTTP/1.1 `stream-one`
  handling plus carrier-local metrics accounting.
- Harness gaps:
  `vless_kcp` no longer fails at config-load time after moving to the current
  finalmask-based schema, but the latest run still times out under traffic with
  no server-side metrics, so runtime behavior remains under investigation
  `vless_tls_tcp`, `trojan_tls`, `vless_quic`

### V2Ray / V2Fly

Result files: [core matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-matrix-check-2/matrix.json), [extra checks](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-extra-check/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-grpc-recheck-4/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-vmess-recheck-1/matrix.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_grpc`, `vmess_standard`, `shadowsocks_aead`
- Not a server defect:
  `vless_httpupgrade` is not accepted by the tested V2Ray 5.49.0 binary, so it was removed
  from the runnable capability set
- Harness gaps:
  `trojan_tls`, `vless_quic`, `shadowsocks_2022`, `vless_kcp`

## Confirmed Server Defects

- Note: wrongsv's gRPC handler now has explicit in-tree regressions for
  multi-stream HTTP/2 reuse plus per-user gRPC metrics, and the latest external
  rechecks show `vless_grpc` passing for Mihomo-core, xray-core, and V2Ray/V2Fly.

- Note: wrongsv's VMess inbound now matches the standard xray/v2fly AEAD
  dialect closely enough for `xray-core`, `V2Ray/V2Fly`, `sing-box`,
  `clash-verge-rev`, `FlClash`, and `Hiddify` VMess compatibility and traffic
  sweeps to pass in the latest external rechecks.
- `server.mihomo_wireguard_protocol`
  Mihomo-class clients expose WireGuard support, but wrongsv still has no WireGuard server-side mode.
- `server.v2ray_meek_transport`
  V2Fly documents Meek transport, but wrongsv has no server-side Meek implementation.
- `server.v2ray_tlsmirror_transport`
  V2Fly documents TLSMirror transport, but wrongsv has no server-side TLSMirror implementation.
- `server.v2ray_docs_transport`
  V2Fly documents the Google Docs Viewer transport, but wrongsv has no corresponding server implementation.
