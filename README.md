# wrongsv-external-tests

Automated proxy app testing infrastructure. Launches FlClash/Hiddify with config, controls them
via Dart VM service extensions, and evaluates proxy behavior.

## Quick Start

```bash
npm install --prefix proxy-app-manager

# Full test cycle for either app
node orchestrate.js --app flclash --config configs/sample-clash-config.yaml --mode test
node orchestrate.js --app hiddify --config configs/sample-singbox-config.json --mode test

# End-to-end wrongsv evaluation with generated client configs, simulated traffic,
# browser behavior, and metrics scraping
node run-client-suite.js --client flclash
node run-client-suite.js --client hiddify
node run-client-suite.js --client sing-box
node run-client-suite.js --client xray-core --wrongsv-config ../wrongsv/configs/reality-vision.toml

# Capability-driven multi-scenario audit
node run-client-matrix.js --client clash-verge-rev
node run-client-matrix.js --client v2ray

# Include intentionally untracked scenarios such as vless_webtransport
node run-client-matrix.js --client xray-core --include-untracked

# When running multiple matrices in parallel, give each one its own
# wrongsv listen-port range, target-port range, and metrics port
node run-client-matrix.js --client xray-core --listen-port-start 50443 --target-port-start 3300 --metrics-port 59220
node run-client-matrix.js --client v2ray --listen-port-start 50543 --target-port-start 3400 --metrics-port 59221

# Recheck the standing Hiddify AnyTLS / WebTransport limitations
node scripts/recheck-standing-limitations.js

# Inspect the current sing-box/Mihomo/xray-core/V2Ray binaries
node scripts/inspect-client-cores.js

# Inspect the current packaged Hiddify desktop bundle for capability markers
node scripts/inspect-hiddify-core.js

# One-shot review evidence check: core-client scans + Hiddify scan + docs + standing limitations
node scripts/verify-review-evidence.js

# Start and leave running (with debug verification)
node orchestrate.js --app flclash --config configs/sample-clash-config.yaml

# Machine-readable output
node orchestrate.js --app flclash --config config.yaml --mode test --json
```

`run-client-matrix.js` summary output now includes:

- `confirmedGaps`
- `confirmedUntracked`
- `confirmedDefects`
- `unexpectedPasses`
- `unexpectedDefectPasses`
- `unexpectedGapPasses`
- `unexpectedUntrackedPasses`

`scripts/recheck-standing-limitations.js` returns a JSON summary describing the
checked runs, their output directories, and the validated scenario status /
reason pairs for the standing Hiddify AnyTLS and WebTransport limitations,
along with the corresponding top-level matrix summary counters
(`confirmedGaps` / `confirmedUntracked`).
It also writes the same payload to `<outputRoot>/summary.json`.

`scripts/check-capability-docs.js --json` emits a structured docs-check
summary (`status`, `checkedClients`, and `intentionallyUntrackedScenarios`).

`scripts/inspect-client-cores.js` emits a machine-readable summary of the
current sing-box, Mihomo, xray-core, and V2Ray binaries, including version
command output, file hash, and client-specific feature markers extracted from
the local binaries.

`scripts/inspect-hiddify-core.js` emits a machine-readable summary of the
current packaged Hiddify desktop bundle, including source-vs-binary markers
such as `editorListsAnytls`, `packagedCoreMissingAnytlsMarkers`, the detected
embedded `sing-box` / `xray-core` dependency versions, and bundle hashes.

`scripts/verify-review-evidence.js` composes those core-client scans, the
Hiddify core scan, the docs-check result, and
`scripts/recheck-standing-limitations.js` into one JSON report. When
`--output-root` is provided, it also writes that combined payload to
`<outputRoot>/review-evidence-summary.json`.

## Directory Layout

```
wrongsv-external-tests/
├── orchestrate.js               # CLI entry point — full lifecycle management
├── run-client-suite.js          # End-to-end wrongsv/client evaluation harness
├── run-client-matrix.js         # Capability-driven multi-scenario audit
├── e2e-harness/                 # wrongsv server runner + client adapters + metrics scraper
├── proxy-app-manager/           # Node.js lifecycle module
│   ├── index.js                 # Public API: ProxyAppManager, BaseClient, VmBridge, ...
│   ├── src/
│   │   ├── ProxyAppManager.js   # Lifecycle orchestrator
│   │   ├── VmBridge.js          # WebSocket JSON-RPC bridge to Dart VM Service
│   │   ├── AppProcess.js        # Binary spawn + Xvfb + VM URI detection
│   │   ├── BaseClient.js        # Abstract interface for proxy app clients
│   │   └── clients/
│   │       ├── FlClashClient.js
│   │       ├── HiddifyClient.js
│   │       └── registry.js
│   ├── test-smoke.js            # Module unit tests
│   └── README.md
├── proxy-testing-framework/     # Node.js proxy evaluation framework
│   ├── puppeteer-debug/         # Browser automation through proxy
│   ├── traffic-simulator/       # fetch-based user behavior simulation
│   ├── user-simulator/          # Puppeteer-based real user behavior simulation
│   └── evaluator/               # Test suites + scoring + reports
├── scripts/
│   ├── start-proxy-app.sh       # Bash: launch app with config + Xvfb
│   ├── run-proxy-test.sh        # Bash: 4-phase E2E orchestrator
│   ├── test-vm-extensions.sh    # Bash: verify all VM extensions at runtime
│   ├── flutter_debug_bridge.py  # Python: WebSocket JSON-RPC bridge
│   ├── import-hiddify-config.py # Python: legacy shell-helper import for Hiddify
│   └── ...
├── configs/
│   ├── sample-clash-config.yaml
│   └── sample-singbox-config.json
├── binaries/                    # Pre-built Flutter profile-mode binaries
│   ├── flclash/
│   └── hiddify/
├── docs/
│   ├── patches.md               # All source modifications to FlClash & Hiddify
│   └── known-limitations.md     # Current limitations and trade-offs
├── FlClash/                     # Git submodule — FlClash fork (debug branch)
└── hiddify-next/                # Git submodule — hiddify-next fork (debug branch)
```

## Architecture

```
┌──────────────┐     WebSocket JSON-RPC     ┌──────────────────────┐
│  orchestrate │◄──────────────────────────►│  FlClash / Hiddify   │
│  .js (CLI)   │     ext.<app>.*            │  (profile mode)      │
│              │                            │  + Xvfb (headless)   │
│  proxy-app-  │                            │  + debug extensions  │
│  manager     │                            └──────────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│  proxy-testing-  │
│  framework       │
│  (evaluator)     │
└──────────────────┘
```

- **proxy-app-manager** — WebSocket bridge + process management. Launch, connect, test, shutdown.
- **proxy-testing-framework** — Puppeteer + traffic simulator for proxy quality evaluation.
- **e2e-harness** — Composes `wrongsv`, app/core clients, traffic workloads, browser workloads, and metrics scraping into reusable client suites.
- **orchestrate.js** — Example lifecycle CLI.
- **run-client-suite.js** — Full wrongsv/client evaluation CLI using the modular harness.

## Debug Service Extensions

Each app registers these extensions at startup:

| Extension | Description |
|-----------|-------------|
| `ext.<app>.getAppState` | Platform info, dart version, timestamp |
| `ext.<app>.dumpSemantics` | Full semantics tree as JSON |
| `ext.<app>.dumpWidgetTree` | Widget tree deep-string (limited in profile mode) |
| `ext.<app>.runSelfTest` | Internal consistency checks |
| `ext.<app>.connectProxy` | Start proxy engine |
| `ext.<app>.disconnectProxy` | Stop proxy engine |
| `ext.<app>.getProxyStatus` | Current proxy connection state |
| `ext.<app>.performSemanticsAction` | Tap/longPress on semantics nodes |
| `ext.hiddify.importAndActivateConfig` | Import and activate a config through Hiddify's ProfileRepository |
| `ext.hiddify.importConfig` | Legacy alias for `ext.hiddify.importAndActivateConfig` |

Replace `<app>` with `flclash` or `hiddify`.

## Supported End-to-End Clients

The reusable suite runner currently knows how to adapt wrongsv-generated configs for:

- `flclash`
- `clash-verge-rev` (Mihomo core path)
- `hiddify`
- `sing-box`
- `xray-core` (validated with REALITY configs; see `docs/known-limitations.md`)
- `v2ray`

See [docs/client-capability-audit.md](docs/client-capability-audit.md) for the
protocol-by-protocol capability matrix, confirmed server defects, current
client-specific harness gaps, and intentionally untracked scenario notes.
See [docs/known-limitations.md](docs/known-limitations.md) for the standing
client/runtime limitations that are not expected to pass until upstream client
or config-shape changes land.

## Debug Surfaces

The harness now captures debug artifacts for both GUI and core clients:

- `FlClash` / `Hiddify`: VM-service snapshots (`getAppState`, `runSelfTest`,
  semantics, widget tree) are written as `debug-*.json`.
- `clash-verge-rev` core path: Mihomo Clash controller API is enabled on
  loopback and the harness records runtime snapshots plus selector actions.
- `sing-box`: Clash API is enabled on loopback and the harness records
  runtime snapshots plus selector actions.

These artifacts are emitted alongside each suite output directory so runtime
UI tweaks and controller-driven changes can be correlated with server behavior.

## Programmatic API

```js
const { ProxyAppManager } = require('./proxy-app-manager');

// Step-by-step lifecycle
const mgr = new ProxyAppManager({
  app: 'flclash',
  config: './configs/sample-clash-config.yaml',
});
await mgr.launch();             // start app, detect VM URI, wait for extensions
await mgr.connectProxy();       // start proxy engine
const status = await mgr.getStatus();
await mgr.disconnectProxy();    // stop proxy engine
await mgr.shutdown();           // clean up

// Or: full lifecycle in one call
const results = await mgr.fullTest({ suite: 'latency' });

// Access the VM bridge directly
const { VmBridge } = require('./proxy-app-manager');
const bridge = new VmBridge('http://127.0.0.1:41343/abc=/');
await bridge.connect();
const state = await bridge.callExtension('ext.flclash.getAppState');
await bridge.disconnect();
```

## Adding a new proxy app

```js
const { BaseClient, registry } = require('./proxy-app-manager');

class MyProxyClient extends BaseClient {
  static get app() { return 'myproxy'; }
  static get displayName() { return 'MyProxy'; }

  get binaryPath() { return '/path/to/binary'; }
  get defaultProxyPort() { return 1080; }

  get extensions() {
    return new Map(Object.entries({
      connectProxy:    { method: 'ext.myproxy.connectProxy',    timeout: 30000 },
      disconnectProxy: { method: 'ext.myproxy.disconnectProxy', timeout: 15000 },
      getAppState:     { method: 'ext.myproxy.getAppState',     timeout: 10000 },
    }));
  }

  async prepareConfig(configPath) { /* install config */ }
}

registry.register(MyProxyClient);
// Now: node orchestrate.js --app myproxy --config ./config.json
```

## Cleanup

Repeated test runs accumulate config files, app data, and log files on disk. Cleanup
methods exist at every layer to prevent unbounded disk growth.

### CLI

```bash
# Remove config/log/data files after shutdown
node orchestrate.js --app flclash --config ./config.yaml --mode test --clean
```

### Programmatic

```js
// Shutdown with cleanup (removes config + log files)
await mgr.shutdown(true);

// Or clean up without full shutdown (if already stopped)
await mgr.cleanup();
```

### Cleanup layers

| Layer | Method | What it cleans |
|-------|--------|----------------|
| `AppProcess` | `stop(force, clean)` / `_cleanFiles()` | Log file in /tmp |
| `BaseClient` | `cleanData()` (abstract) | Hook for subclass data cleanup |
| `FlClashClient` | `cleanData()` | `config.yaml` in data dir |
| `HiddifyClient` | `cleanData()` | `config.json`, `current-config.json`, `.log`/`.tmp` files |
| `ProxyAppManager` | `shutdown(clean)` / `cleanup()` / `_cleanData()` | Delegates to client.cleanData() |
| `orchestrate.js` | `--clean` flag | Passes clean flag through to shutdown |

## Rebuilding binaries

```bash
# FlClash
cd FlClash
flutter build linux --profile
cp -r build/linux/x64/profile/bundle/* ../binaries/flclash/

# Hiddify
cd hiddify-next
dart run build_runner build --delete-conflicting-outputs
flutter build linux --profile
cp -r build/linux/x64/profile/bundle/* ../binaries/hiddify/
```

## See also

- [docs/patches.md](docs/patches.md) — Complete list of source modifications
- [docs/known-limitations.md](docs/known-limitations.md) — Current patch,
  client/runtime, and infrastructure limitations
- [proxy-app-manager/README.md](proxy-app-manager/README.md) — Module API docs
- [proxy-testing-framework/README.md](proxy-testing-framework/README.md) — Evaluator docs
