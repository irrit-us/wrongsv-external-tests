# wrongsv-external-tests

Automated proxy app testing infrastructure. Launches FlClash/Hiddify with config, controls them
via Dart VM service extensions, and evaluates proxy behavior.

## Quick Start

```bash
npm install --prefix proxy-app-manager

# Full test cycle for either app
node orchestrate.js --app flclash --config configs/sample-clash-config.yaml --mode test
node orchestrate.js --app hiddify --config configs/sample-singbox-config.json --mode test

# Start and leave running (with debug verification)
node orchestrate.js --app flclash --config configs/sample-clash-config.yaml

# Machine-readable output
node orchestrate.js --app flclash --config config.yaml --mode test --json
```

## Directory Layout

```
wrongsv-external-tests/
├── orchestrate.js               # CLI entry point — full lifecycle management
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
│   ├── import-hiddify-config.py # Python: pre-populate Hiddify SQLite config
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
- **orchestrate.js** — Single CLI combining both modules.

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
| `ext.hiddify.importConfig` | Import a config file (Hiddify only) |

Replace `<app>` with `flclash` or `hiddify`.

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
- [docs/known-limitations.md](docs/known-limitations.md) — Current limitations and trade-offs
- [proxy-app-manager/README.md](proxy-app-manager/README.md) — Module API docs
- [proxy-testing-framework/README.md](proxy-testing-framework/README.md) — Evaluator docs
