# Client Debugging And Test Integration

This directory records how each supported client integrates into the reusable
`wrongsv-external-tests` harness, what debug surface is available, and which
remaining issues are clearly client-side rather than `wrongsv` server defects,
including scenarios that stay intentionally untracked until the capability
metadata and client config shape are ready.

Shared entry points:

- `run-client-suite.js`: one scenario, traffic profiles, optional browser flow.
- `run-client-matrix.js`: capability-driven sweep across runnable scenarios.
  Pass `--include-untracked` when you also want the matrix to exercise
  intentionally untracked scenarios such as `vless_webtransport`.
- `scripts/inspect-client-cores.js`: scan the current sing-box, Mihomo,
  xray-core, and V2Ray binaries for version/build metadata and feature markers
  that back the process-level debug path.
- `scripts/inspect-hiddify-core.js`: scan the current packaged Hiddify desktop
  bundle plus the local `hiddify-next` source tree for capability markers such
  as editor-exposed AnyTLS vs packaged-core transport modules.
- `e2e-harness/client-runners.js`: launch abstraction for GUI apps and core binaries.
- `e2e-harness/debug-control.js`: debug adapters for VM-service, Clash API, and
  process-level inspection.

Artifacts written by the harness:

- `report.json`: compatibility, traffic, user-behavior, and metrics deltas.
- `debug-initial.json`: initial runtime snapshot.
- `debug-tweaks.json`: best-effort runtime tweak result.
- `debug-final.json`: end-of-run runtime snapshot.

Per-client references:

- [FlClash](./flclash.md)
- [clash-verge-rev](./clash-verge-rev.md)
- [Hiddify](./hiddify.md)
- [sing-box](./sing-box.md)
- [xray-core](./xray-core.md)
- [V2Ray / V2Fly](./v2ray.md)
