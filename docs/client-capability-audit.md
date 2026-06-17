# Client Capability Audit

This audit pivots protocol coverage around what the client can actually do,
then classifies the outcome as one of:

- `covered`: wrongsv + harness + client interoperate
- `server defect`: the client capability exists, but wrongsv fails to interoperate
- `harness gap`: the capability exists and wrongsv may support it, but the external harness
  does not yet emit a valid runtime config or launch path for that client version
- `intentionally untracked`: the capability is known, but the matrix keeps it
  outside both `runnableScenarios` and `harnessGaps` until a current client
  config shape and capability entry exist

The machine-readable `run-client-matrix.js` `matrix.json` rows currently use
these scenario-level status values:

- `passed`
- `failed`
- `defect_confirmed`
- `gap_confirmed`
- `untracked_confirmed`
- `unexpected_pass`
- `unexpected_gap_pass`
- `unexpected_untracked_pass`

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
  snapshots from the reusable process-level debug client. Those process
  snapshots now also embed a `binarySummary` with version/build output, file
  hash, and feature markers from `scripts/inspect-client-cores.js`. Treat that
  block as supplemental binary evidence, not as a replacement for matrix-level
  runnable coverage.
- `FlClash` and `Hiddify` continue to emit VM-service snapshots through the
  Flutter bridge path.
- `xray-core` and `V2Ray/V2Fly` now also emit reusable `debug-*.json`
  artifacts via the process-level debug client, including PID, `/proc` status,
  listening sockets, config summary, log tail, and the same `binarySummary`
  inspection block. Example runs:
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
Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.json), [matrix.md](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-matrix/matrix.md), [AnyTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-anytls-check-20260616T133621Z/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-grpc-recheck-3/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-vmess-recheck-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-hysteria2-check-2/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-tuic-check-2/tuic_tcp/report.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_httpupgrade`, `vless_grpc`,
  `wireguard_tunnel_http`, `hysteria2_tcp`, `tuic_tcp`, `anytls_tcp`,
  `vmess_standard`, `shadowsocks_aead`, `shadowsocks_2022`, `trojan_tls`
- `anytls_tcp` passes through the direct Mihomo core path after rebuilding the
  current `wrongsv` release binary; the check reports compatibility true and
  zero traffic errors.
- `vless_xhttp` now passes after forcing `mode: "stream-one"` in the generated
  Mihomo/Xray-family client config.
- `wireguard_tunnel_http` now passes through wrongsv's new userspace
  WireGuard tunnel service at
  [results/clash-verge-wireguard-check-2](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/clash-verge-wireguard-check-2/matrix.json).
- Harness gaps:
  `vless_quic`, `vless_kcp`
- Current KCP note: the Mihomo core on this box still tries a TCP dial against
  the KCP port even when `network: mkcp` / `mkcp-opts` are present, so this
  remains a client/runtime gap rather than a wrongsv server defect.

### FlClash

Result files: [suite](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-suite-3/report.json), [AnyTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-anytls-check-20260616T133659Z/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-vmess-recheck-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-hysteria2-check-1/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-tuic-check-1/tuic_tcp/report.json), [WireGuard check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/flclash-wireguard-check-2/matrix.json)

- Covered through the actual GUI client:
  `vless_raw_tcp`, `wireguard_tunnel_http`, `vmess_standard`, `hysteria2_tcp`,
  `tuic_tcp`, `anytls_tcp`
- `anytls_tcp` passes through the FlClash GUI path with compatibility true,
  zero traffic errors, and per-user byte/connection deltas from wrongsv metrics.
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

Result files: [app-native import check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-app-import-native-1/matrix.json), [AnyTLS attempt](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-check-4/matrix.json), [AnyTLS recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-gap-confirmed/matrix.json), [AnyTLS isolated recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-gap-isolated-2/matrix.json), [AnyTLS isolated startup debug](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-gap-isolated-2/anytls_tcp/debug-startup-failure.json), [AnyTLS app-native import check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-anytls-app-import-native-1/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-vmess-recheck-1/matrix.json), [ShadowTLS check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-shadowtls-check-1/matrix.json), [Hysteria2 check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-hysteria2-check-2/hysteria2_tcp/report.json), [TUIC check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-tuic-check-3/tuic_tcp/report.json), [XHTTP check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-xhttp-check-4/vless_xhttp/report.json), [XHTTP long](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/hiddify-xhttp-long-2/vless_xhttp/report.json)

- Covered:
  `vmess_standard`, `shadowtls_tcp`, `hysteria2_tcp`, `tuic_tcp`, `vless_xhttp`
- The current app-manager path now imports Hiddify configs through the
  app-native `ext.hiddify.importAndActivateConfig` extension rather than the
  raw SQLite helper. The dedicated `vless_raw_tcp` check records
  `lastImportResult.status = "ok"` with the Hiddify-managed config path in the
  debug snapshot.
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
  `anytls_tcp` is excluded from Hiddify `runnableScenarios` until a passing
  direct GUI run is recorded. The stored Hiddify AnyTLS attempts fail before a
  usable local proxy port is exposed, so deploy-time client generation should
  skip Hiddify for AnyTLS configs even though plain sing-box covers the same
  protocol. The current stored evidence set came from Hiddify app version 4.1.2
  (build 40102), and the packaged runtime logs in that run show bundled
  Xray 25.3.6. The latest isolated rerun keeps Hiddify on a per-result
  `.runtime/` tree, still leaves the GUI in `Disconnected` state with a
  visible `Cloudflare WARP 同意书` dialog, and still records
  `connectResult: "error"` plus no local mixed-port exposure. The isolated
  startup artifact now shows `runtimeSummary.requestedConfig` with an AnyTLS
  outbound, `runtimeSummary.currentConfig = null`, and `appLogTail`
  containing `decode config: outbounds[0]: unknown outbound type: anytls`.
  The newer app-native import check reaches the same conclusion inside
  Hiddify's own repository path: `profileRepository.addLocal(...)` now fails
  with `[SingboxParser] unmarshal error: outbounds[0]: unknown outbound type:
  anytls`, so the standing gap still reproduces even when the raw SQLite import
  shortcut is removed from the main app-manager path.
  `node scripts/inspect-hiddify-core.js` now also records the current source
  and packaged-bundle markers behind that gap: the Hiddify editor source still
  lists `anytls` in `json_editor.dart`, but the current packaged desktop
  `lib/hiddify-core.so` exposes no AnyTLS marker while still exposing scanned
  `shadowtls`, `hysteria2`, `tuic`, and Xray wrapper paths, with embedded
  `sing-box` `v1.8.9` in the same bundle.
  The matrix also carries `status = "gap_confirmed"` together with
  `startupDebugArtifact`, `connectError`, and `gapReason`, which keeps the
  issue in the packaged GUI/runtime path rather than `wrongsv` itself.

### xray-core

Result files: [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-matrix/matrix.json), [XHTTP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-xhttp-check-7/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-grpc-recheck-6/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-vmess-recheck-3/matrix.json), [KCP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-kcp-check-6/vless_kcp/report.json), [WebTransport matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-webtransport-matrix-1/matrix.json), [WebTransport startup debug](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-webtransport-matrix-1/vless_webtransport/debug-startup-failure.json)

- Covered:
  `vless_reality_vision`, `vless_httpupgrade`, `vless_grpc`, `vless_xhttp`, `vless_kcp`, `vmess_standard`, `shadowsocks_2022`
- `vless_xhttp` now passes after wrongsv added plaintext HTTP/1.1 `stream-one`
  handling plus carrier-local metrics accounting.
- `vless_kcp` now passes after wrongsv replaced the generic Rust KCP session
  layer with an Xray-compatible mKCP segment engine. The latest xray-core
  recheck (`xray-kcp-check-6`) also reports normal traffic metrics and
  per-user byte deltas.
- `vless_webtransport` is now explicitly recorded in external capability
  metadata as intentionally untracked, and remains absent from both
  `runnableScenarios` and `harnessGaps` for now. The ad hoc probe against the tested xray-core
  26.5.9 build never exposed the SOCKS port because the generated
  QUIC-shaped outbound config was rejected at startup with
  `The feature QUIC transport (without web service, etc.) has been removed and migrated to XHTTP stream-one H3.`,
  so `wrongsv` now keeps direct xray-family WebTransport export gated until a
  current client config shape exists. The dedicated matrix rerun now records
  `status = "untracked_confirmed"` with `expectedUntracked = true` and the same
  machine-readable untracked reason.
- Harness gaps:
  `vless_tls_tcp`, `trojan_tls`, `vless_quic`

### V2Ray / V2Fly

Result files: [core matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-matrix-check-2/matrix.json), [extra checks](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-extra-check/matrix.json), [gRPC recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-grpc-recheck-4/matrix.json), [VMess recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-vmess-recheck-1/matrix.json), [KCP recheck](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-kcp-check-2/vless_kcp/report.json), [Meek check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-meek-check-11/vless_meek/report.json), [Google Docs Viewer check](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-gdocs-check-6/vless_gdocsviewer/report.json), [WebTransport matrix](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-webtransport-matrix-2/matrix.json), [WebTransport report](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-webtransport-matrix-2/vless_webtransport/report.json)

- Covered:
  `vless_raw_tcp`, `vless_ws_tcp`, `vless_grpc`, `vless_meek`, `vless_gdocsviewer`, `vless_kcp`, `vmess_standard`, `shadowsocks_aead`
- Not a server defect:
  `vless_httpupgrade` is not accepted by the tested V2Ray 5.49.0 binary, so it was removed
  from the runnable capability set
- `vless_meek` now passes after wrongsv added a request-session carrier with
  per-session HTTP POST polling and the V2Ray harness switched this scenario to
  a native `jsonv5` Meek outbound with a pinned TLS certificate.
- `vless_gdocsviewer` now passes after wrongsv added a Google Docs Viewer
  origin endpoint and the V2Ray harness switched this scenario to a full
  upstream-built `jsonv5` binary plus a local mock viewer/text frontend.
- `tlsmirror` is no longer tracked as a client-capability defect: the upstream
  V2Ray codebase on this box registers `tlsmirror` only as a server-side
  listener, not as a runnable outbound transport alias for the tested client
  binary.
- `vless_kcp` now passes after the V2Ray adapter converts wrongsv's newer
  Xray-style KCP output into the legacy `kcpSettings.seed` form expected by the
  tested V2Fly 5.49.0 runtime.
- `vless_webtransport` is now explicitly recorded in external capability
  metadata as intentionally untracked, and remains absent from both
  `runnableScenarios` and `harnessGaps` for now. The ad hoc probe against the tested V2Ray 5.49.0
  binary did launch the local SOCKS port, but compatibility and traffic both
  failed while the paired `wrongsv` WebTransport endpoint logged repeated
  `peer doesn't support any known protocol` session errors. `wrongsv` now keeps
  the direct xray/v2ray-family WebTransport export path gated until a current
  client config shape exists. The dedicated matrix rerun now records
  `status = "untracked_confirmed"` with `expectedUntracked = true` and the same
  machine-readable untracked reason.
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
- None currently confirmed in the latest client-capability sweeps.
