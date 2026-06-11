#!/usr/bin/env node
/**
 * CLI entry point for proxy evaluation.
 *
 * Usage:
 *   node evaluator/cli.js --proxy socks5://127.0.0.1:1080 --suite latency
 *   node evaluator/cli.js --proxy http://127.0.0.1:7890 --suite comprehensive --output ./results/
 *   node evaluator/cli.js --list-suites
 *   node evaluator/cli.js --help
 */

const path = require("path");

// Deferred requires for fast --help/--list-suites
let DebugSession, BenchmarkRunner, TestSuite, ResultAggregator, ReportGenerator;

function lazyLoad() {
  if (!DebugSession) {
    DebugSession = require("../puppeteer-debug").DebugSession;
    BenchmarkRunner = require("../traffic-simulator").BenchmarkRunner;
    TestSuite = require("./TestSuite").TestSuite;
    ResultAggregator = require("./ResultAggregator").ResultAggregator;
    ReportGenerator = require("./ReportGenerator").ReportGenerator;
  }
}

function printHelp() {
  console.log(`Proxy Testing Framework CLI

Usage:
  node evaluator/cli.js --proxy <URL> --suite <name> [options]

Options:
  --proxy, -p <url>      Proxy URL (socks5://host:port, http://host:port)
  --suite, -s <name>     Test suite name or path to suite file
  --output, -o <dir>     Output directory (default: ./results)
  --duration, -d <ms>    Override test duration in milliseconds
  --concurrency, -c <n>  Override concurrency level
  --puppeteer            Enable Puppeteer tests (requires DISPLAY)
  --no-traffic            Disable traffic simulation
  --list-suites           List available preset suites
  --profiles              List available traffic profiles
  --verbose, -v           Verbose output
  --help, -h              Show this help
`);
}

function listSuites() {
  const { TestSuite } = require("./TestSuite");
  console.log("Available test suites:\n");
  for (const s of TestSuite.listPresets()) {
    console.log(`  ${s.name.padEnd(20)} ${s.description}`);
  }
}

function listProfiles() {
  const { BehaviorProfile } = require("../traffic-simulator");
  console.log("Available traffic profiles:\n");
  for (const p of BehaviorProfile.listProfiles()) {
    console.log(`  ${p.name.padEnd(18)} ${p.description}`);
  }
}

function parseArgs(argv) {
  const args = {
    proxy: null,
    suite: "latency",
    output: "./results",
    duration: null,
    concurrency: null,
    puppeteer: false,
    noTraffic: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--proxy" || a === "-p") args.proxy = argv[++i];
    else if (a === "--suite" || a === "-s") args.suite = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--duration" || a === "-d") args.duration = parseInt(argv[++i], 10);
    else if (a === "--concurrency" || a === "-c") args.concurrency = parseInt(argv[++i], 10);
    else if (a === "--puppeteer") args.puppeteer = true;
    else if (a === "--no-traffic") args.noTraffic = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--list-suites") { listSuites(); process.exit(0); }
    else if (a === "--profiles") { listProfiles(); process.exit(0); }
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else {
      console.error(`Unknown option: ${a}`);
      printHelp();
      process.exit(1);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --proxy is optional for direct/local tests

  lazyLoad();

  console.error(`\n=== Proxy Evaluation ===`);
  console.error(`Proxy: ${args.proxy || "(direct — no proxy)"}`);
  console.error(`Suite: ${args.suite}`);
  console.error(`Output: ${args.output}\n`);

  // Load suite
  let suite;
  try {
    suite = TestSuite.load(args.suite);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }

  // Apply overrides
  if (args.duration) {
    if (suite.traffic) suite.traffic.duration = args.duration;
    console.error(`Duration override: ${args.duration}ms`);
  }
  if (args.concurrency) {
    if (suite.traffic) suite.traffic.concurrency = args.concurrency;
    console.error(`Concurrency override: ${args.concurrency}`);
  }
  if (args.noTraffic && suite.traffic) suite.traffic.enabled = false;
  if (args.puppeteer && suite.puppeteer) suite.puppeteer.enabled = true;

  const startTime = Date.now();
  let puppeteerResult = null;
  let trafficResult = null;

  // --- Puppeteer tests ---
  if (suite.puppeteer && suite.puppeteer.enabled) {
    console.error("[Puppeteer] Starting browser tests...");
    try {
      const session = new DebugSession({
        proxy: args.proxy,
        targets: suite.puppeteer.targets,
        outputDir: path.join(args.output, "puppeteer"),
        headless: suite.puppeteer.headless !== false,
        captureHar: suite.puppeteer.captureHar !== false,
        screenshots: suite.puppeteer.screenshots || false,
        navigationTimeout: suite.puppeteer.navigationTimeout || 30000,
      });
      puppeteerResult = await session.run();
      await session.close();
      console.error("[Puppeteer] Complete.");
    } catch (err) {
      console.error(`[Puppeteer] Error: ${err.message}`);
      puppeteerResult = { error: err.message };
    }
  }

  // --- Traffic simulation ---
  if (suite.traffic && suite.traffic.enabled) {
    console.error(
      `[Traffic] Starting simulation (${suite.traffic.duration / 1000}s, profile: ${suite.traffic.profile || suite.traffic.profileConfig})...`
    );
    try {
      const runner = new BenchmarkRunner({
        proxy: args.proxy,
        profile: suite.traffic.profile || suite.traffic.profileConfig,
        duration: suite.traffic.duration,
        concurrency: suite.traffic.concurrency,
        maxRetries: suite.traffic.maxRetries || 0,
        verbose: args.verbose,
        baseUrl: args.baseUrl || suite.traffic.baseUrl || null,
      });
      trafficResult = await runner.run();
      console.error("[Traffic] Complete.");
    } catch (err) {
      console.error(`[Traffic] Error: ${err.message}`);
      trafficResult = { error: err.message };
    }
  }

  // --- Aggregate ---
  const aggregator = new ResultAggregator(puppeteerResult, trafficResult, suite);
  const report = aggregator.aggregate();

  // --- Generate reports ---
  const generator = new ReportGenerator(report, { outputDir: args.output });
  const files = await generator.generateAll();

  console.error(`\n=== Results ===`);
  console.error(`Overall Score: ${report.scores.overall}/100`);
  console.error(`Recommendation: ${report.recommendation}`);
  console.error(`\nReports:`);
  console.error(`  JSON: ${files.json}`);
  console.error(`  MD:   ${files.markdown}`);
  console.error(`  HTML: ${files.html}`);

  // Output JSON to stdout for piping
  console.log(JSON.stringify(report, null, 2));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.error(`\nTotal time: ${elapsed}s`);

  process.exit(report.scores.overall >= 50 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(2);
});
