# Proxy Testing Framework

Puppeteer debug + traffic simulator for comprehensive proxy evaluation. Tests proxy **reliability**, **stability**, and **efficiency** under realistic usage patterns.

## Modules

### puppeteer-debug
Browser automation through proxy with full network introspection.
```
ProxyBrowser      → Launch Puppeteer through SOCKS5/HTTP proxy
NetworkRecorder   → Capture all requests/responses with timing
HARCollector      → Generate HAR 1.2 files for Chrome DevTools
ScreenshotTool    → Scheduled/on-demand screenshots
ConsoleCapture    → Browser console log collection
DebugSession      → Unified orchestrator
```

### traffic-simulator
fetch-based user behavior simulation through proxy.
```
ProxyFetchClient  → fetch() through proxy with per-request timing
BehaviorProfile   → 6 realistic user profiles (web-browsing, video-streaming, etc.)
PatternGenerator  → Generates burst-based request patterns
MetricsCollector  → Latency (p50/p95/p99), throughput, error distribution
BenchmarkRunner   → End-to-end benchmark orchestration
```

### evaluator
Combines both modules for scored evaluations with reports.
```
TestSuite         → Load preset or custom test suites
ResultAggregator  → Score proxy on latency, stability, throughput, errors
ReportGenerator   → Output JSON, Markdown, HTML reports
CLI               → Command-line entry point
```

### user-simulator
Puppeteer-based real user behavior simulation through SOCKS/HTTP proxy.
```
UserSimulator     → Launch headless Chromium through proxy, drive realistic behaviors
BehaviorRunner    → Execute action sequences (navigate, scroll, click, type, wait, hover, evaluate)
behaviors/        → 6 built-in behaviors (web-browsing, video-streaming, social-media, e-commerce, form-interaction, multi-page)
utils/proxy.js    → Proxy URL parser + Puppeteer launch option builder
```

## Quick Start

### 1. Install dependencies
```bash
cd proxy-testing-framework
npm install
```

### 2. Start your proxy
Ensure Hiddify or FlClash is running with SOCKS5/HTTP proxy exposed.

### 3. Run a test
```bash
# Quick latency check
node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite latency

# Comprehensive evaluation
node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite comprehensive --output ./results/

# With Puppeteer (requires DISPLAY)
node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite comprehensive --puppeteer

# List available suites
node evaluator/cli.js --list-suites

# List traffic profiles
node evaluator/cli.js --profiles
```

## Using the convenience script
```bash
# Full automation: assumes proxy already running
bash scripts/run-evaluation.sh --proxy socks5://127.0.0.1:1080 --suite latency

# With app auto-launch
bash scripts/run-evaluation.sh --app hiddify --suite comprehensive
```

## Programmatic API

```js
const { DebugSession } = require('./puppeteer-debug');
const { BenchmarkRunner } = require('./traffic-simulator');
const { Evaluator } = require('./evaluator');

// Low-level: Puppeteer debug session
const session = new DebugSession({
  proxy: 'socks5://127.0.0.1:1080',
  targets: ['https://example.com'],
  outputDir: './debug-results/',
});
const puppeteerReport = await session.run();
await session.close();

// Low-level: Traffic benchmark
const runner = new BenchmarkRunner({
  proxy: 'socks5://127.0.0.1:1080',
  profile: 'web-browsing',
  duration: 30000,
});
const trafficReport = await runner.run();

// Low-level: User behavior simulation
const { UserSimulator, listBehaviors } = require('./user-simulator');
console.log(listBehaviors()); // 6 built-in profiles

const sim = new UserSimulator({
  proxy: 'socks5://127.0.0.1:1080',
  behavior: 'web-browsing',
  duration: 30000,
  recordNetwork: true,
});
const userReport = await sim.run();
// userReport.summary, userReport.actions, userReport.networkEvents
await sim.close();

// High-level: Full evaluation
const evaluator = new Evaluator({ proxy: 'socks5://127.0.0.1:1080' });
const report = await evaluator.runSuite('comprehensive');
// report = { scores: { overall, puppeteer, traffic }, ... }
```

## Using from ../wrongsv
```js
const { Evaluator } = require(
  '../wrongsv-external-tests/proxy-testing-framework/evaluator'
);

async function evaluateProxy(proxyUrl) {
  const evaluator = new Evaluator({
    proxy: proxyUrl,
    outputDir: './proxy-test-results/',
  });
  return evaluator.runSuite('comprehensive');
}
```

## Scoring

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | A | Excellent — production ready |
| 75–89  | B | Good — minor issues |
| 50–74  | C | Fair — monitor closely |
| 25–49  | D | Poor — significant problems |
| 0–24   | F | Fail — unreliable |

## Traffic Profiles

| Profile | Description | Concurrency |
|---------|-------------|-------------|
| `web-browsing` | Pages, images, XHR | 2–4 |
| `video-streaming` | Large sequential downloads | 1–2 |
| `api-heavy` | REST API calls, POST/PUT/DELETE | 5–10 |
| `social-media` | Image-heavy scrolling | 4–8 |
| `general` | Balanced mix | 3–6 |
| `quick-check` | Minimal requests, fast latency | 1 |

## Test Suites

| Suite | Focus | Default Duration |
|-------|-------|------------------|
| `latency-test` | Responsiveness | 10s |
| `stability-test` | Long-running reliability | 5min |
| `throughput-test` | Max bandwidth under load | 30s |
| `comprehensive-test` | Full evaluation | 1min |
