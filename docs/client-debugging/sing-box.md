# sing-box

Launch path:

- Runner: `CoreProcessRunner`
- Harness entry: `createClientRunner({ client: "sing-box" })`
- Binary: local `sing-box`
- Runtime config: native sing-box JSON from `buildSingBoxRuntimeConfig` or
  protocol-specific builders.

Debug surface:

- Composite debug adapter:
  `ClashApiDebugClient` + `ProcessDebugClient`
- Clash API provides:
  `version`, `configs`, `proxies`, `connections`, selector mutation
- Process debug provides:
  PID, `/proc/<pid>/status`, listening sockets, config summary, log tail

Testing integration:

- Core process launched with `run -c <config>`
- Harness waits for mixed proxy port `10809`
- The same reusable scenario catalog is used as for Hiddify, but plain
  sing-box still uses its own native transport surface where possible

Artifacts:

- `debug-initial.json`
- `debug-tweaks.json`
- `debug-final.json`
- `report.json`

Client-side limitations:

- No current harness gaps are left in the covered protocol set.
- Historical note: plain sing-box XHTTP originally failed because its
  `v2ray-http` transport used `PUT` plus raw HTTP/1 response bodies. That is
  now handled server-side by `wrongsv`, so it is no longer a client issue.
