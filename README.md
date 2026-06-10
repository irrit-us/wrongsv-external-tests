# wrongsv-external-tests

Flutter debug bridge and test infrastructure for programmatic testing of Hiddify and FlClash apps. Designed to be driven by `../wrongsv` as an external test harness.

## Directory Layout

```
wrongsv-external-tests/
├── bridge.sh                  # Convenience CLI wrapper for debug bridge
├── scripts/
│   ├── flutter_debug_bridge.py  # Python VM Service WebSocket bridge
│   ├── test_runner.sh           # CI/test runner (modes: local, ci, bridge, discover)
│   ├── convert_to_junit.py      # Flutter --machine JSONL → JUnit XML
│   ├── run-evaluation.sh        # Proxy evaluation convenience script
│   └── semantics_tree_dump.dart # In-app Dart semantics serialization utility
├── proxy-testing-framework/    # Node.js proxy evaluation framework
│   ├── puppeteer-debug/         # Puppeteer browser automation through proxy
│   ├── traffic-simulator/       # fetch-based user behavior simulation
│   └── evaluator/               # Combined test suites + scoring + reports
├── hiddify-next/              # Hiddify app (cloned, with debug extensions added)
├── FlClash/                   # FlClash app (cloned, with debug extensions added)
├── agent_misc/                # Reference: flutter-testing-framework skill
└── README.md
```

## Quick Start

### Prerequisites
```bash
pip install websockets
```

### 1. Launch the app in debug mode
```bash
cd hiddify-next   # or FlClash
flutter run --debug
# Note the VM service URI printed:
# "An Observatory debugger and profiler is available at: http://127.0.0.1:XXXXX/...=/"
```

### 2. Enable debug mode in the app

**Hiddify:** Settings → General → toggle "Debug Mode" → visit Settings → Developer → tap "Register Debug Extensions"

**FlClash:** In About page, tap the app icon 5 times rapidly to enable Developer Mode. Then Tools → Developer → toggle Developer Mode → tap "Register Debug Extensions"

### 3. Use the bridge
```bash
# Connect and dump semantics tree
bash bridge.sh hiddify --port <PORT_FROM_STEP_1> --dump-semantics

# Run self-tests on FlClash
bash bridge.sh flclash --port <PORT> --call-extension ext.flclash.runSelfTest

# Dump widget tree and save to directory
bash bridge.sh hiddify --port <PORT> --dump-widget-tree -o results/

# Evaluate arbitrary Dart code
bash bridge.sh hiddify --port <PORT> --evaluate "2 + 2"

# Everything at once
bash bridge.sh flclash --port <PORT> \
  --dump-semantics \
  --dump-widget-tree \
  --get-memory \
  --call-extension ext.flclash.runSelfTest \
  -o results/
```

## Debug Service Extensions

Each app registers these extensions when debug mode is enabled:

| Extension | Description |
|-----------|-------------|
| `ext.<app>.getAppState` | Platform info, locale, timestamp |
| `ext.<app>.dumpSemantics` | Full semantics tree as JSON |
| `ext.<app>.dumpWidgetTree` | Widget tree deep-string |
| `ext.<app>.runSelfTest` | Internal consistency checks with pass/fail |

Replace `<app>` with `hiddify` or `flclash`.

## Using from ../wrongsv

```python
import json
import subprocess

def dump_semantics(app: str, port: int) -> dict:
    """Connect to a running Flutter app and dump its semantics tree."""
    proc = subprocess.run(
        [
            "python3",
            "wrongsv-external-tests/scripts/flutter_debug_bridge.py",
            "--app", app,
            "--port", str(port),
            "--dump-semantics",
        ],
        capture_output=True,
        text=True,
        cwd="../",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Bridge failed: {proc.stderr}")
    return json.loads(proc.stdout)

def run_self_test(app: str, port: int) -> dict:
    """Run app self-tests via VM service extension."""
    proc = subprocess.run(
        [
            "python3",
            "wrongsv-external-tests/scripts/flutter_debug_bridge.py",
            "--app", app,
            "--port", str(port),
            "--call-extension", f"ext.{app}.runSelfTest",
        ],
        capture_output=True,
        text=True,
        cwd="../",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Bridge failed: {proc.stderr}")
    return json.loads(proc.stdout)
```

## Proxy Testing Framework

Node.js framework for comprehensive proxy evaluation. Combines Puppeteer browser automation and fetch-based traffic simulation to test proxy reliability, stability, and efficiency.

### Quick Start
```bash
cd proxy-testing-framework
npm install

# Latency check (no browser needed)
node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite latency

# Comprehensive evaluation
node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite comprehensive -o results/
```

### Convenience script
```bash
bash scripts/run-evaluation.sh --proxy socks5://127.0.0.1:1080 --suite latency
bash scripts/run-evaluation.sh --app hiddify --suite comprehensive
```

### Using from ../wrongsv
```js
const { Evaluator } = require(
  '../wrongsv-external-tests/proxy-testing-framework/evaluator'
);
const evaluator = new Evaluator({ proxy: 'socks5://127.0.0.1:1080' });
const report = await evaluator.runSuite('comprehensive');
// report.scores.overall → 0–100 score
// report.recommendation → EXCELLENT/GOOD/FAIR/POOR/FAIL
```

### Programmatic API

**Puppeteer debug (browser through proxy):**
```js
const { DebugSession } = require('./proxy-testing-framework/puppeteer-debug');
const session = new DebugSession({
  proxy: 'socks5://127.0.0.1:1080',
  targets: ['https://example.com', 'https://httpbin.org/ip'],
  outputDir: './debug-results/',
});
const report = await session.run();
// report.harPath → HAR file for Chrome DevTools
// report.screenshots → captured screenshots
// report.networkSummary → totalRequests, errors, bytes
await session.close();
```

**Traffic simulation (fetch through proxy):**
```js
const { BenchmarkRunner } = require('./proxy-testing-framework/traffic-simulator');
const runner = new BenchmarkRunner({
  proxy: 'socks5://127.0.0.1:1080',
  profile: 'web-browsing',  // or api-heavy, video-streaming, social-media, general
  duration: 30000,          // 30 seconds
  concurrency: 5,
});
const results = await runner.run();
// results.metrics.latency → { p50, p75, p90, p95, p99 }
// results.metrics.errors → { total, rate, byType }
// results.metrics.throughput → { requestsPerSec, bytesPerSec }
```

See [proxy-testing-framework/README.md](proxy-testing-framework/README.md) for full documentation.

## Test Runner Modes

```bash
# Run widget tests only (no device needed)
bash scripts/test_runner.sh --app hiddify --mode local

# Full CI pipeline: unit + integration tests → JUnit XML
bash scripts/test_runner.sh --app hiddify --mode ci --output results/

# Bridge mode: connect to already-running app
bash scripts/test_runner.sh --app hiddify --mode bridge --port 8181 --dump-semantics

# Discover mode: launch app + wait for VM service + bridge
bash scripts/test_runner.sh --app hiddify --mode discover --device emulator-5554 --dump-semantics
```

## Output Format

All bridge commands produce JSON with a common schema:

```json
{
  "runId": "uuid",
  "appName": "hiddify|flclash",
  "vmServiceUri": "http://127.0.0.1:8181/...=/",
  "startTime": "2026-06-10T00:00:00Z",
  "endTime": "2026-06-10T00:00:01Z",
  "semanticsTree": {...},
  "widgetTree": {...},
  "customExtensionResults": [{"extension": "ext.app.xxx", "result": {...}}],
  "testResults": [{"testName": "...", "passed": true, "durationMs": 0}],
  "summary": {"total": 0, "passed": 0, "failed": 0, "skipped": 0}
}
```

Error envelopes:
```json
{
  "error": true,
  "code": "VM_SERVICE_UNAVAILABLE",
  "message": "Could not connect...",
  "retryable": true
}
```

## JUnit Conversion

```bash
flutter test --machine | python3 scripts/convert_to_junit.py --output results/junit.xml
python3 scripts/convert_to_junit.py --input results/unit_tests.jsonl --output results/junit.xml
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│           ../wrongsv (test orchestrator)          │
│  subprocess.run(bridge.py) → JSON results        │
└──────────────┬──────────────┬────────────────────┘
               │              │
    WebSocket JSON-RPC   WebSocket JSON-RPC
    (VM Service)         (VM Service)
               │              │
    ┌──────────▼────┐  ┌─────▼──────────┐
    │   Hiddify     │  │    FlClash     │
    │  debug mode   │  │  developer mode│
    │  VM svc :PORT │  │  VM svc :PORT  │
    │  ext.hiddify.* │  │  ext.flclash.*│
    └───────────────┘  └────────────────┘
```

Both apps use Flutter's built-in Dart VM Service Protocol (JSON-RPC over WebSocket). Custom service extensions (`ext.<app>.*`) provide app-specific test commands. The Python bridge connects, issues commands, and returns structured JSON.
