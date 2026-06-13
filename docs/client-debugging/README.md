# Client Debugging And Test Integration

This directory records how each supported client integrates into the reusable
`wrongsv-external-tests` harness, what debug surface is available, and which
remaining issues are clearly client-side rather than `wrongsv` server defects.

Shared entry points:

- `run-client-suite.js`: one scenario, traffic profiles, optional browser flow.
- `run-client-matrix.js`: capability-driven sweep across runnable scenarios.
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
