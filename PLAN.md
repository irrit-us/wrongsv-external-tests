# Plan: Proxy Testing Framework — Puppeteer Debug + Traffic Simulator

## Goal

Build a Node.js proxy-testing framework with two encapsulated modules:
1. **Puppeteer debug module** — browser automation through proxy with full network introspection
2. **Traffic simulator** — fetch-based real user behavior simulation through proxy

Together they enable comprehensive evaluation of proxy reliability, stability, and efficiency, building on the Flutter debug bridge that already controls Hiddify/FlClash.

## Architecture

```
wrongsv-external-tests/
├── proxy-testing-framework/          # NEW — Node.js package
│   ├── package.json                  # Single package, two modules
│   ├── index.js                      # Top-level exports
│   │
│   ├── puppeteer-debug/              # Module 1: Puppeteer debug capability
│   │   ├── index.js                  # Public API
│   │   ├── ProxyBrowser.js           # Browser launch with proxy config
│   │   ├── NetworkRecorder.js        # Full request/response capture + timing
│   │   ├── HARCollector.js           # HAR 1.2 file generator
│   │   ├── ScreenshotTool.js         # Timed/scheduled screenshots
│   │   ├── ConsoleCapture.js         # Browser console log collection
│   │   └── DebugSession.js           # Unified session: browser + recorder + HAR + screenshots
│   │
│   ├── traffic-simulator/            # Module 2: Real user behavior simulation
│   │   ├── index.js                  # Public API
│   │   ├── ProxyFetchClient.js       # fetch() wrapper with proxy agent support
│   │   ├── BehaviorProfile.js        # User behavior profile definitions
│   │   ├── PatternGenerator.js       # Generates realistic request sequences
│   │   ├── MetricsCollector.js       # Latency, throughput, error tracking
│   │   └── BenchmarkRunner.js        # End-to-end benchmark orchestration
│   │
│   ├── evaluator/                    # Combined evaluator
│   │   ├── index.js                  # Public API
│   │   ├── cli.js                    # CLI entry: node cli.js --suite latency --proxy socks5://...
│   │   ├── TestSuite.js              # Suite runner: orchestrates both modules
│   │   ├── ResultAggregator.js       # Merge puppeteer + traffic results
│   │   ├── ReportGenerator.js        # JSON, Markdown, HTML reports
│   │   └── presets/
│   │       ├── latency-test.js       # Measure proxy latency
│   │       ├── stability-test.js     # Long-running stability
│   │       ├── throughput-test.js    # Max throughput measurement
│   │       └── comprehensive-test.js # Full evaluation suite
│   │
│   └── README.md
│
├── scripts/
│   └── run-evaluation.sh             # Convenience: launch proxy → test → collect
│
└── (existing files unchanged)
```

## Data Flow

```
┌──────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  Hiddify /   │    │  proxy-testing-       │    │  ../wrongsv      │
│  FlClash     │    │  framework            │    │  (consumer)      │
│              │    │                       │    │                  │
│  Socks5/HTTP │◄───│  Puppeteer ──► HAR    │    │  require('...')  │
│  proxy port  │    │  debug       ──► PNG   │───►│  → results      │
│              │    │              ──► JSON  │    │                  │
│              │◄───│  Traffic     ──► stats │    │  node cli.js    │
│              │    │  simulator   ──► JSON  │───►│  → report       │
└──────────────┘    └──────────────────────┘    └──────────────────┘
```

## Phase 1: Puppeteer Debug Module (`puppeteer-debug/`)

Encapsulated Node.js module that wraps Puppeteer with proxy testing capabilities.

### API Surface

```js
const { ProxyBrowser, DebugSession, NetworkRecorder } = require('./puppeteer-debug');

// Low-level: launch a browser through proxy
const browser = await ProxyBrowser.launch({
  proxy: 'socks5://127.0.0.1:1080',   // proxy URL
  headless: true,
  args: ['--no-sandbox'],
});

// Network recording
const recorder = new NetworkRecorder(page);
recorder.start();
await page.goto('https://example.com');
const events = recorder.stop();  // [{url, method, status, timing, headers, size}]

// High-level: full debug session
const session = new DebugSession({
  proxy: 'socks5://127.0.0.1:1080',
  targets: ['https://example.com', 'https://httpbin.org/ip'],
  screenshots: { interval: 1000 },
  har: { output: './results/debug.har' },
});
const report = await session.run();
// report = { har, screenshots, consoleLogs, networkEvents, navigationTiming }
```

### Components

1. **ProxyBrowser.js** — Factory for puppeteer.launch() with proxy args
   - Parse proxy URL (socks5://, http://, https://)
   - Apply `--proxy-server` arg
   - Optional proxy auth via `page.authenticate()`
   - Browser pool for concurrent sessions

2. **NetworkRecorder.js** — Event-based network capture
   - Hooks: `request`, `response`, `requestfailed`, `requestfinished`
   - Captures: URL, method, status, timing (dnsStart→responseEnd), headers, body size
   - Filtering by URL pattern, resource type
   - Export to structured JSON

3. **HARCollector.js** — HAR 1.2 spec generator
   - Converts NetworkRecorder events to HAR entries
   - Includes: timings (blocked, dns, connect, send, wait, receive), request/response headers, content mimeType/size
   - Writes valid `.har` files loadable in Chrome DevTools

4. **ScreenshotTool.js** — Screenshot management
   - Full page + viewport screenshots
   - Timed interval capture during navigation
   - Named output with timestamps
   - Comparison helper (pixel diff)

5. **ConsoleCapture.js** — Console log collector
   - Levels: log, warn, error, info, debug
   - Source location (URL:line)
   - Filterable by level

6. **DebugSession.js** — Unified session orchestrator
   - Single entry point for full debug capture
   - Sequential target navigation
   - Aggregates all sub-module outputs
   - Returns structured report

## Phase 2: Traffic Simulator (`traffic-simulator/`)

Node.js module using fetch (undici) with proxy agent to simulate real user behavior.

### API Surface

```js
const { 
  ProxyFetchClient, BehaviorProfile, 
  BenchmarkRunner, MetricsCollector 
} = require('./traffic-simulator');

// Low-level: fetch through proxy
const client = new ProxyFetchClient('socks5://127.0.0.1:1080');
const res = await client.fetch('https://httpbin.org/get');
const timing = client.lastTiming;  // { dns, connect, tls, ttfb, total }

// Behavior profiles define realistic traffic patterns
const profile = BehaviorProfile.create('web-browsing');
// profile = { requests: [...], concurrency: 3, duration: 30000, rampUp: 5000 }

// High-level: benchmark
const runner = new BenchmarkRunner({
  proxy: 'socks5://127.0.0.1:1080',
  profile: 'web-browsing',
  duration: 60_000,    // 1 minute
  concurrency: 5,
});
const results = await runner.run();
// results = { metrics, requestDetails, timeline }
```

### Components

1. **ProxyFetchClient.js** — fetch() through proxy
   - Uses `undici` ProxyAgent or `https-proxy-agent`/`socks-proxy-agent`
   - Per-request timing breakdown
   - Automatic retry with backoff
   - Connection reuse (keep-alive)
   - DNS caching
   - HTTP/1.1 and HTTP/2 support detection

2. **BehaviorProfile.js** — User behavior definitions
   - Built-in profiles:
     - `web-browsing`: mixed static assets + XHR, 3-5 concurrent, burst pattern
     - `video-streaming`: large sequential downloads, 1-2 concurrent, steady
     - `api-heavy`: POST/PUT/DELETE mix, JSON payloads, 5-10 concurrent
     - `social-media`: image-heavy, intermittent, 4-8 concurrent
     - `general`: balanced mix, 3-6 concurrent
   - Custom profiles via config object
   - Request templates with realistic headers (User-Agent, Accept, etc.)

3. **PatternGenerator.js** — Generates request sequences
   - Given a profile, produces a timed sequence of fetch calls
   - Randomized delays within profile parameters
   - Think time between "page loads"
   - Burst vs steady patterns
   - Graceful ramp-up and cool-down

4. **MetricsCollector.js** — Statistical measurement
   - Latency: min, max, avg, median, p50, p75, p90, p95, p99
   - Error rate: by HTTP status (4xx, 5xx) and connection errors
   - Throughput: requests/sec, KB/sec over time windows
   - DNS resolution time distribution
   - TLS handshake time distribution
   - TTFB distribution
   - Time-series data for chart generation

5. **BenchmarkRunner.js** — End-to-end orchestration
   - Configures client with proxy
   - Selects behavior profile
   - Runs for specified duration
   - Manages concurrency with async pool
   - Collects metrics on completion
   - Handles early termination and cleanup

## Phase 3: Evaluator (`evaluator/`)

Combines both modules to produce comprehensive proxy evaluations. Includes a CLI for standalone use and a programmatic API for `../wrongsv` integration.

### CLI Usage

```bash
# Full evaluation
node proxy-testing-framework/evaluator/cli.js \
  --proxy socks5://127.0.0.1:1080 \
  --suite comprehensive \
  --output ./results/

# Quick latency check
node proxy-testing-framework/evaluator/cli.js \
  --proxy http://127.0.0.1:7890 \
  --suite latency

# Stability test (30 min)
node proxy-testing-framework/evaluator/cli.js \
  --proxy socks5://127.0.0.1:1080 \
  --suite stability \
  --duration 1800000 \
  --output ./results/
```

### API Surface

```js
const { Evaluator } = require('./evaluator');

const evaluator = new Evaluator({
  proxy: 'socks5://127.0.0.1:1080',
  outputDir: './results/',
});

// Run a single test suite
const report = await evaluator.runSuite('comprehensive');
// report = { summary, puppeteerResults, trafficResults, score, recommendations }
```

### Components

1. **TestSuite.js** — Defines and runs suites
   - Each suite is a JS file exporting a test config
   - Runs puppeteer-debug and traffic-simulator in sequence or parallel
   - Collects and passes results to aggregator

2. **ResultAggregator.js** — Merges results
   - Combines puppeteer + traffic metrics
   - Scores proxy on: reliability (error rate), stability (variance), efficiency (throughput/latency)
   - Weighted scoring algorithm

3. **ReportGenerator.js** — Output formats
   - JSON (machine-readable, for ../wrongsv)
   - Markdown (human-readable summary)
   - HTML (visual dashboard with charts)

4. **Presets (suite definitions)**:
   - `latency-test.js`: minimal tests, focus on RTT measurement
   - `stability-test.js`: long-running, detects memory leaks, connection drops
   - `throughput-test.js`: concurrent downloads, measures max bandwidth
   - `comprehensive-test.js`: all of the above, full report

## Phase 4: Integration & Convenience Scripts

### `scripts/run-evaluation.sh`
```bash
#!/bin/bash
# Launch proxy app (Hiddify/FlClash), wait for ready, run evaluation
# Usage: bash run-evaluation.sh --app hiddify --proxy-port 1080 --suite comprehensive
```

### ../wrongsv integration
```js
const { Evaluator } = require('./wrongsv-external-tests/proxy-testing-framework/evaluator');

async function testProxy(proxyUrl) {
  const evaluator = new Evaluator({ proxy: proxyUrl });
  const report = await evaluator.runSuite('comprehensive');
  return report;
}
```

## Implementation Order

1. **Phase 1** — Puppeteer-debug module (ProxyBrowser → NetworkRecorder → HAR → Screenshots → Console → Session)
2. **Phase 2** — Traffic-simulator module (ProxyFetchClient → BehaviorProfile → PatternGenerator → Metrics → BenchmarkRunner)
3. **Phase 3** — Evaluator (presets → TestSuite → ResultAggregator → ReportGenerator → CLI)
4. **Phase 4** — Integration scripts + README + E2E smoke test

## Dependencies

| Package | Purpose |
|---------|---------|
| `puppeteer` | Browser automation |
| `socks-proxy-agent` | SOCKS5 proxy for fetch |
| `https-proxy-agent` | HTTP proxy for fetch |
| `undici` | High-performance fetch (Node 18+ built-in) |

## Verification

- Phase 1: `node -e "require('./puppeteer-debug')"` loads without error; launch + network capture works
- Phase 2: `node -e "require('./traffic-simulator')"` loads; fetch through proxy returns timing
- Phase 3: `node evaluator/cli.js --proxy <real-proxy> --suite latency` produces valid report
- Phase 4: `bash scripts/run-evaluation.sh --help` works
