# proxy-app-manager

Unified Node.js lifecycle manager for proxy apps (FlClash, Hiddify). Launch, connect, test, disconnect, shutdown — all via a clean programmatic API. Extensible client registry for adding more proxy apps.

## CLI Quick Start

```bash
# Start an app with config, verify debug extensions, keep running
node proxy-app-manager/orchestrate.js --app flclash --config configs/sample-clash-config.yaml

# Full test cycle (launch → debug verify → connect → status → self-test → disconnect → shutdown)
node proxy-app-manager/orchestrate.js --app flclash --config configs/sample-clash-config.yaml --mode test

# Extended test (test + semantics + widget tree)
node proxy-app-manager/orchestrate.js --app hiddify --config configs/sample-singbox-config.json --mode full

# Verify debug extensions on an already-running app
node proxy-app-manager/orchestrate.js --mode debug-verify --vm-uri http://127.0.0.1:41343/DP-Bi1xVQNo=

# Machine-readable JSON output
node proxy-app-manager/orchestrate.js --app flclash --config config.yaml --mode test --json

# Graceful shutdown of a running app
node proxy-app-manager/orchestrate.js --mode shutdown --vm-uri http://127.0.0.1:41343/DP-Bi1xVQNo=
```

### CLI Modes

| Mode | Description |
|------|-------------|
| `launch` | Start app + install config + verify debug + keep running (default) |
| `test` | Full cycle: launch → verify → connect → status → selfTest → disconnect → shutdown |
| `full` | Extended test + semantics dump + widget tree |
| `debug-verify` | Connect to running app, verify all debug extensions |
| `shutdown` | Connect to running app, disconnect proxy, stop it |

### CLI Flags

| Flag | Description |
|------|-------------|
| `--app <name>` | App to use: `flclash` (default), `hiddify` |
| `--config <path>` | Proxy config file (required for launch/test/full) |
| `--mode <mode>` | Operation mode (default: `launch`) |
| `--vm-uri <uri>` | VM service URI (required for debug-verify, shutdown) |
| `--no-headless` | Show app window instead of Xvfb |
| `--timeout <ms>` | Operation timeout in ms (default: 60000) |
| `--json` | Output results as JSON |
| `--keep-running` | Don't stop app after test/full |
| `--suite <name>` | Test suite for full mode (default: latency) |
| `--output-dir <path>` | Results directory for full mode |

## Programmatic API

```js
const { ProxyAppManager } = require('proxy-app-manager');

const mgr = new ProxyAppManager({
  app: 'flclash',
  config: './configs/sample-clash-config.yaml',
});

await mgr.launch();
await mgr.connectProxy();
console.log('Proxy:', mgr.getProxyUrl());
console.log('VM URI:', mgr.vmUri);

const status = await mgr.getStatus();
console.log('Status:', status);

await mgr.disconnectProxy();
await mgr.shutdown();
```

## Full lifecycle in one call

```js
const results = await mgr.fullTest({
  suite: 'latency',
  outputDir: './results',
});
// results.launch, .connect, .status, .selfTest, .evaluation, .disconnect
```

## Step-by-step API

| Method | Description |
|--------|-------------|
| `launch()` | Prepare config, start app + Xvfb, detect VM URI, connect bridge |
| `connectProxy()` | Start the proxy engine |
| `disconnectProxy()` | Stop the proxy engine |
| `getStatus()` | Query proxy connection state |
| `runSelfTest()` | Run internal consistency checks |
| `dumpSemantics()` | Dump semantics tree as JSON |
| `dumpWidgetTree()` | Dump widget tree (limited in profile mode) |
| `performSemanticsAction({action, label, id})` | Tap/longPress a widget by label or id |
| `callExtension(name, params)` | Call any registered extension |
| `getProxyUrl()` | Get socks5://127.0.0.1:PORT URL |
| `shutdown()` | Graceful stop + cleanup |
| `fullTest(options)` | launch → connect → test → disconnect → shutdown |

## Supported clients

| Client | App name | Extensions |
|--------|----------|------------|
| FlClash | `flclash` | connectProxy, disconnectProxy, getProxyStatus, runSelfTest, getAppState, dumpSemantics, dumpWidgetTree, performSemanticsAction |
| Hiddify | `hiddify` | Same as FlClash + importConfig; auto-detects real proxy port after connect |

```js
const { listClients } = require('proxy-app-manager');
console.log(listClients());
// [{app:'flclash', displayName:'FlClash'}, {app:'hiddify', displayName:'hiddify'}]
```

## Adding a new client

```js
const { BaseClient, registry } = require('proxy-app-manager');

class MyProxyClient extends BaseClient {
  static get app() { return 'myproxy'; }
  static get displayName() { return 'MyProxy'; }

  get binaryPath() { return '/path/to/binary'; }
  get defaultProxyPort() { return 1080; }
  get extensions() {
    return new Map(Object.entries({
      connectProxy: { method: 'ext.myproxy.connectProxy', description: '...', timeout: 30000 },
      disconnectProxy: { method: 'ext.myproxy.disconnectProxy', description: '...', timeout: 15000 },
    }));
  }

  async prepareConfig(configPath) { /* install config */ }
}

registry.register(MyProxyClient);

// Now usable everywhere
const mgr = new ProxyAppManager({ app: 'myproxy', config: '...' });
```

## Architecture

```
ProxyAppManager  (orchestrator — lifecycle methods)
├── BaseClient   (abstract — per-app paths, config, extensions)
│   ├── FlClashClient   (copy YAML config)
│   └── HiddifyClient   (SQLite DB import, port auto-detect)
├── AppProcess   (spawn binary + Xvfb, detect VM URI)
└── VmBridge     (WebSocket JSON-RPC to Dart VM service)
```

## Integration with proxy-testing-framework

```js
const mgr = new ProxyAppManager({ app: 'flclash', config: './config.yaml' });
await mgr.launch();
await mgr.connectProxy();

// The proxy is now live — use the evaluator
const { Evaluator } = require('proxy-testing-framework/evaluator');
const evaluator = new Evaluator({ proxy: mgr.getProxyUrl() });
const report = await evaluator.runSuite('comprehensive');

await mgr.disconnectProxy();
await mgr.shutdown();
```

Or simply use `fullTest()` which does all of this automatically.

## Dependencies

- `ws` — WebSocket client for Dart VM Service protocol
- Node.js ≥ 18
- Xvfb (for headless mode)
- Flutter profile-mode binaries in `binaries/` directory
