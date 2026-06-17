# xray-core

Launch path:

- Runner: `CoreProcessRunner`
- Harness entry: `createClientRunner({ client: "xray-core" })`
- Binary: local `xray`
- Runtime config: Xray JSON from `buildXrayRuntimeConfig`

Debug surface:

- Primary debug adapter: `ProcessDebugClient`
- Available data:
  PID, `/proc/<pid>/status`, listening sockets, parsed config summary, log tail,
  and `binarySummary` version/build markers for the tested xray-core binary
- Runtime tweaks:
  not supported; the tested binary does not expose a live controller API in the
  harness path

Testing integration:

- Core process launched with `run -config <config>`
- Harness waits for SOCKS port `10808`
- Used for direct confirmation of Xray-family transport compatibility, including
  `vless_kcp` and `vless_xhttp`

Artifacts:

- `debug-initial.json`
- `debug-tweaks.json`
- `debug-final.json`
- `report.json`

Client-side limitations:

- `vless_tls_tcp`, `trojan_tls`, and `vless_quic` remain outside the current
  runnable matrix for this harness path.
- `vless_webtransport` is intentionally not tracked in the current runnable or
  harness-gap metadata. That state is now explicit in
  `e2e-harness/capabilities.js`. The explicit matrix rerun at
  [matrix.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-webtransport-matrix-1/matrix.json)
  records `status = "untracked_confirmed"` with `expectedUntracked = true`.
  The paired startup artifact at
  [debug-startup-failure.json](/home/johnsilver/focus/wrongsv/wrongsv-external-tests/results/xray-webtransport-matrix-1/vless_webtransport/debug-startup-failure.json)
  shows the tested xray-core 26.5.9 build rejecting the generated
  QUIC-shaped outbound before opening its SOCKS port, with the runtime log
  saying QUIC transport was removed in favor of `XHTTP stream-one H3`.
- `vless_kcp` is covered and should not be treated as a `wrongsv` defect.
