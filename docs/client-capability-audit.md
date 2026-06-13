# Client Capability Audit

This audit pivots protocol coverage around what the client can actually do,
then classifies the outcome as one of:

- `covered`: wrongsv + harness + client interoperate
- `server defect`: the client capability exists, but wrongsv fails to interoperate
- `harness gap`: the capability exists and wrongsv may support it, but the external harness
  does not yet emit a valid runtime config or launch path for that client version

Per-client debug and harness integration references live under
[client-debugging/README.md](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/docs/client-debugging/README.md).

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

## Debug Surfaces

- `clash-verge-rev` and `sing-box` now emit composite `debug-*.json` artifacts:
  runtime control state from the Clash API plus process/socket/config/log
  snapshots from the reusable process-level debug client.
- `FlClash` and `Hiddify` continue to emit VM-service snapshots through the
  Flutter bridge path.
- `xray-core` and `V2Ray/V2Fly` now also emit reusable `debug-*.json`
  artifacts via the process-level debug client, including PID, `/proc` status,
  listening sockets, config summary, and log tail. Example runs:
  [xray debug](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-debug-check-1/vless_raw_tcp/debug-initial.json)
  and
  [v2ray debug](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-debug-check-1/vless_raw_tcp/debug-initial.json).
- Runtime tweaks remain best-effort: Clash-family cores expose live selector/API
  mutation, while Xray/V2Ray currently expose process-level inspection only
  because the tested binaries do not ship a comparable control API in this
  harness.

## Executed Matrices

### clash-verge-rev (Mihomo core path)

Runtime path: Mihomo core via [run-client-matrix.js](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/run-client-matrix.js)  
Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.json), [matrix.md](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.md), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-grpc-recheck-3/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-vmess-recheck-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-hysteria2-check-2/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-tuic-check-2/tuic_tcp/report.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_httpupgrade`, `vless_grpc`,
  `hysteria2_tcp`, `tuic_tcp`, `vmess_standard`, `shadowsocks_aead`,
  `shadowsocks_2022`, `trojan_tls`
- `vless_xhttp` now passes after forcing `mode: "stream-one"` in the generated
  Mihomo/Xray-family client config.
- Harness gaps:
  `vless_quic`, `vless_kcp`
- Current KCP note: the Mihomo core on this box still tries a TCP dial against
  the KCP port even when `network: mkcp` / `mkcp-opts` are present, so this
  remains a client/runtime gap rather than a wrongsv server defect.

### FlClash

Result files: [suite](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-suite-3/report.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-vmess-recheck-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-hysteria2-check-1/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-tuic-check-1/tuic_tcp/report.json)

- Covered through the actual GUI client:
  `vless_raw_tcp`, `vmess_standard`, `hysteria2_tcp`, `tuic_tcp`
- Broader protocol capability for the underlying Mihomo core follows the
  `clash-verge-rev` section above; the dedicated FlClash GUI automation here is
  still a smaller subset.
- Remaining client/runtime gaps:
  `vless_quic`, `vless_kcp`

### sing-box

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-matrix-2/matrix.json), [quic check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-quic-check-2/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-vmess-recheck-1/matrix.json), [AnyTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-anytls-check-3/matrix.json), [ShadowTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-shadowtls-check-2/matrix.json), [XHTTP check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-xhttp-check-3/vless_xhttp/report.json), [XHTTP long](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-xhttp-long-1/vless_xhttp/report.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-hysteria2-check-4/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/singbox-tuic-check-5/tuic_tcp/report.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_quic`, `vmess_standard`,
  `vless_xhttp`, `anytls_tcp`, `shadowtls_tcp`, `hysteria2_tcp`, `tuic_tcp`,
  `shadowsocks_2022`, `trojan_tls`
- `anytls_tcp` now also reports per-user byte and connection deltas after the
  sing-anytls SOCKS5 metrics path was wired into the shared metrics registry.
- `shadowtls_tcp` now passes after wrongsv switched to ShadowTLS v3 wire
  behavior and the reusable harness builder was updated to send VLESS through a
  ShadowTLS detour instead of a standalone outbound.
- `vless_xhttp` now passes on the installed sing-box core after wrongsv's
  HTTP/1 XHTTP path was widened to accept the `PUT` + raw-body response shape
  used by sing-box's `v2ray-http` client transport.
- `hysteria2_tcp` and `tuic_tcp` now both pass on the installed sing-box core,
  and the refreshed server runs show per-user byte deltas for `user@example.com`
  once the QUIC handlers were wired into wrongsv's metrics registry.
- Harness gaps:
  none

### Hiddify

Result files: [AnyTLS attempt](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-check-4/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-vmess-recheck-1/matrix.json), [ShadowTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-shadowtls-check-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-hysteria2-check-2/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-tuic-check-3/tuic_tcp/report.json), [XHTTP check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-xhttp-check-4/vless_xhttp/report.json), [XHTTP long](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-xhttp-long-2/vless_xhttp/report.json)

- Covered:
  `vmess_standard`, `shadowtls_tcp`, `hysteria2_tcp`, `tuic_tcp`, `vless_xhttp`
- `shadowtls_tcp` now passes through the same reusable VLESS-over-ShadowTLS
  harness path used for sing-box-core.
- `hysteria2_tcp` and `tuic_tcp` now also pass through Hiddify's packaged core
  using the same reusable runtime builders as sing-box, and the refreshed
  server-side runs now emit per-user byte deltas for `user@example.com`.
- `vless_xhttp` now passes through Hiddify's custom `type: "xray"` outbound
  wrapper, which embeds wrongsv's Xray-format `splithttp` config instead of
  relying on the narrower native transport-type list exposed by the packaged
  sing-box fork.
- Harness gaps:
  `anytls` is still blocked in the packaged Hiddify core on this box:
  its runtime logs reject `type: "anytls"` as an unknown outbound type.

### xray-core

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-matrix/matrix.json), [XHTTP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-xhttp-check-7/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-grpc-recheck-6/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-vmess-recheck-3/matrix.json), [KCP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-kcp-check-6/vless_kcp/report.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_grpc`, `vless_xhttp`, `vless_kcp`, `vmess_standard`, `shadowsocks_2022`
- `vless_xhttp` now passes after wrongsv added plaintext HTTP/1.1 `stream-one`
  handling plus carrier-local metrics accounting.
- `vless_kcp` now passes after wrongsv replaced the generic Rust KCP session
  layer with an Xray-compatible mKCP segment engine. The latest xray-core
  recheck (`xray-kcp-check-6`) also reports normal traffic metrics and
  per-user byte deltas.
- Harness gaps:
  `vless_tls_tcp`, `trojan_tls`, `vless_quic`

### V2Ray / V2Fly

Result files: [core matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-matrix-check-2/matrix.json), [extra checks](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-extra-check/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-grpc-recheck-4/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-vmess-recheck-1/matrix.json), [KCP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-kcp-check-2/vless_kcp/report.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_grpc`, `vless_kcp`, `vmess_standard`, `shadowsocks_aead`
- Not a server defect:
  `vless_httpupgrade` is not accepted by the tested V2Ray 5.49.0 binary, so it was removed
  from the runnable capability set
- `vless_kcp` now passes after the V2Ray adapter converts wrongsv's newer
  Xray-style KCP output into the legacy `kcpSettings.seed` form expected by the
  tested V2Fly 5.49.0 runtime.
- Harness gaps:
  `trojan_tls`, `vless_quic`, `shadowsocks_2022`

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
