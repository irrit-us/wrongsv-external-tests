# V2Ray / V2Fly

Launch path:

- Runner: `CoreProcessRunner`
- Harness entry: `createClientRunner({ client: "v2ray" })`
- Binary: local `v2ray`
- Runtime config: V2Ray JSON from `buildV2RayRuntimeConfig`

Debug surface:

- Primary debug adapter: `ProcessDebugClient`
- Available data:
  PID, `/proc/<pid>/status`, listening sockets, parsed config summary, log tail,
  and `binarySummary` version/build markers for the tested V2Ray binary
- Runtime tweaks:
  not supported; the tested binary exposes no comparable control API in this
  harness path

Testing integration:

- Core process launched with `run -config <config>`
- Harness waits for SOCKS port `10818`
- V2Ray-specific adapter normalization is used where the runtime still expects
  older schema, such as `kcpSettings.seed` instead of Xray's newer `finalmask`
  form

Artifacts:

- `debug-initial.json`
- `debug-tweaks.json`
- `debug-final.json`
- `report.json`

Client-side limitations:

- `vless_httpupgrade` is not accepted by the tested V2Ray 5.49.0 binary. This
  is a client limitation, not a `wrongsv` defect.
- `vless_webtransport` is intentionally not tracked in the current runnable or
  harness-gap metadata. That state is now explicit in
  `e2e-harness/capabilities.js`. The explicit matrix rerun at
  [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-webtransport-matrix-2/matrix.json)
  records `status = "untracked_confirmed"` with `expectedUntracked = true`.
  The paired run report at
  [report.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/v2ray-webtransport-matrix-2/vless_webtransport/report.json)
  starts the tested V2Ray 5.49.0 binary and opens the local SOCKS port, but
  compatibility and traffic both fail while the paired `wrongsv` endpoint logs
  repeated WebTransport session protocol errors (`peer doesn't support any known protocol`).
- Remaining harness gaps:
  `trojan_tls`, `vless_quic`, `shadowsocks_2022`
- `vless_kcp` is covered and should not be recorded as a `wrongsv` issue.
