# V2Ray / V2Fly

Launch path:

- Runner: `CoreProcessRunner`
- Harness entry: `createClientRunner({ client: "v2ray" })`
- Binary: local `v2ray`
- Runtime config: V2Ray JSON from `buildV2RayRuntimeConfig`

Debug surface:

- Primary debug adapter: `ProcessDebugClient`
- Available data:
  PID, `/proc/<pid>/status`, listening sockets, parsed config summary, log tail
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
- Remaining harness gaps:
  `trojan_tls`, `vless_quic`, `shadowsocks_2022`
- `vless_kcp` is covered and should not be recorded as a `wrongsv` issue.
