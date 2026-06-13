# xray-core

Launch path:

- Runner: `CoreProcessRunner`
- Harness entry: `createClientRunner({ client: "xray-core" })`
- Binary: local `xray`
- Runtime config: Xray JSON from `buildXrayRuntimeConfig`

Debug surface:

- Primary debug adapter: `ProcessDebugClient`
- Available data:
  PID, `/proc/<pid>/status`, listening sockets, parsed config summary, log tail
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
- `vless_kcp` is covered and should not be treated as a `wrongsv` defect.
