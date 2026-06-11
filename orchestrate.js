#!/usr/bin/env node
/**
 * orchestrate.js — Unified CLI for proxy app lifecycle management.
 *
 * Example script using the proxy-app-manager module. Lives outside the module
 * at repo root for easy access.
 *
 * Modes:
 *   launch         Start app + install config + verify debug extensions + keep running
 *   test           Full cycle: launch → verify → connect → status → selfTest → disconnect → shutdown
 *   full           Extended cycle: test + semantics dump + widget tree
 *   debug-verify   Connect to running app and verify all extensions
 *   shutdown       Disconnect proxy and stop a running app
 *
 * Usage:
 *   node orchestrate.js --app flclash --config ./config.yaml
 *   node orchestrate.js --app hiddify --config ./config.json --mode test
 *   node orchestrate.js --mode debug-verify --vm-uri http://127.0.0.1:8181/abc=/
 *   node orchestrate.js --mode full --app flclash --config ./config.yaml --json
 */

const path = require("path");
const { ProxyAppManager, listClients } = require("./proxy-app-manager");
const { VmBridge } = require("./proxy-app-manager/src/VmBridge");

// =============================================================================
// CLI argument parsing
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    app: "flclash",
    config: "",
    mode: "launch",
    headless: true,
    timeout: 60000,
    json: false,
    vmUri: "",
    proxyPort: 0,
    keepRunning: false,
    suite: "latency",
    outputDir: "",
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    switch (a) {
      case "--app":
        opts.app = next;
        i++;
        break;
      case "--config":
        opts.config = path.resolve(next);
        i++;
        break;
      case "--mode":
        opts.mode = next;
        i++;
        break;
      case "--no-headless":
        opts.headless = false;
        break;
      case "--timeout":
        opts.timeout = parseInt(next, 10) || 60000;
        i++;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--vm-uri":
        opts.vmUri = next;
        i++;
        break;
      case "--proxy-port":
        opts.proxyPort = parseInt(next, 10) || 0;
        i++;
        break;
      case "--keep-running":
        opts.keepRunning = true;
        break;
      case "--suite":
        opts.suite = next;
        i++;
        break;
      case "--output-dir":
        opts.outputDir = next;
        i++;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        printHelp();
        process.exit(1);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`orchestrate.js — Proxy app lifecycle orchestrator

Usage:
  node orchestrate.js --app <name> --config <path> [--mode <mode>] [flags]

Modes:
  launch         Start app, install config, verify debug extensions, keep running (default)
  test           Full lifecycle: launch → verify → connect → status → selfTest → shutdown
  full           Extended: test + semantics + widget tree dump
  debug-verify   Connect to running app via --vm-uri and verify all extensions
  shutdown       Connect to running app, disconnect proxy, and stop it

Flags:
  --app <name>         App to launch: flclash (default), hiddify
  --config <path>      Proxy config file (required for launch/test/full)
  --mode <mode>        Operation mode (default: launch)
  --vm-uri <uri>       VM service URI (required for debug-verify, shutdown)
  --no-headless        Show the app window instead of Xvfb
  --timeout <ms>       Operation timeout in ms (default: 60000)
  --json               Output results as JSON
  --keep-running       Don't stop the app after test/full mode
  --suite <name>       Test suite for full mode (default: latency)
  --output-dir <path>  Results output directory for full mode
  -h, --help           Show this help

Examples:
  # Start FlClash and verify debug works
  node orchestrate.js --app flclash --config ./configs/sample-clash-config.yaml

  # Quick test cycle
  node orchestrate.js --app hiddify --config ./configs/sample-singbox-config.json --mode test

  # Verify debug extensions on an already-running app
  node orchestrate.js --mode debug-verify --vm-uri http://127.0.0.1:41343/DP-Bi1xVQNo=

  # Machine-readable output
  node orchestrate.js --app flclash --config ./config.yaml --mode test --json
`);
}

// =============================================================================
// Output helpers
// =============================================================================

class Output {
  constructor(jsonMode) {
    this.jsonMode = jsonMode;
    this.results = {};
    this.steps = [];
  }

  step(label) {
    this.steps.push(label);
    if (!this.jsonMode) {
      process.stderr.write(`  ${label}... `);
    }
  }

  ok(detail = "") {
    const last = this.steps[this.steps.length - 1];
    if (this.jsonMode) {
      this.results[last] = { status: "ok", detail };
    } else {
      process.stderr.write(`✓${detail ? " " + detail : ""}\n`);
    }
  }

  fail(reason) {
    const last = this.steps[this.steps.length - 1];
    if (this.jsonMode) {
      this.results[last] = { status: "fail", reason };
    } else {
      process.stderr.write(`✗ ${reason}\n`);
    }
  }

  info(msg) {
    if (!this.jsonMode) {
      process.stderr.write(`${msg}\n`);
    }
  }

  final(data) {
    if (this.jsonMode) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// =============================================================================
// Debug verification — test every registered extension
// =============================================================================

async function verifyDebugExtensions(bridge, client, appName, out) {
  out.info("");
  out.info("── Debug Extension Verification ──");

  const extMap = client.extensions;
  const results = {};
  let passed = 0;
  let failed = 0;

  // Some extensions need test params to produce a valid response.
  // importConfig needs a real file — create a minimal valid temp file.
  const fs = require("fs");
  const os = require("os");
  const tmpConfig = path.join(os.tmpdir(), "orch-import-test-config.json");
  try {
    fs.writeFileSync(tmpConfig, JSON.stringify({ inbounds: [{ type: "mixed", listen_port: 1080 }] }));
  } catch (_) {}

  const testParams = {
    performSemanticsAction: { value: JSON.stringify({ action: "tap", label: "Test" }) },
    importConfig: { value: JSON.stringify({ filePath: tmpConfig }) },
  };

  for (const [name, meta] of extMap) {
    out.step(`ext.${appName}.${name}`);
    const extParams = testParams[name] || {};
    try {
      const result = await bridge.callExtension(meta.method, extParams);

      if (result && !result.error) {
        const sane = isSaneResponse(name, result);
        if (sane) {
          results[name] = { status: "ok", summary: summarize(name, result) };
          out.ok(describe(name, result));
          passed++;
        } else {
          results[name] = { status: "bad_response", raw: truncate(result) };
          out.fail(`unexpected response: ${truncate(result)}`);
          failed++;
        }
      } else if (result && result.error) {
        results[name] = { status: "error", error: truncate(result.error) };
        out.fail(`VM error: ${truncate(result.error)}`);
        failed++;
      } else {
        results[name] = { status: "empty" };
        out.fail("empty response");
        failed++;
      }
    } catch (err) {
      results[name] = { status: "exception", error: err.message };
      out.fail(err.message);
      failed++;
    }
  }

  const summary = { passed, failed, total: passed + failed, results };
  out.info(`\n  Debug extensions: ${passed}/${passed + failed} verified`);

  return summary;
}

// ---- Response sanity checks ----

function isSaneResponse(name, result) {
  switch (name) {
    case "getAppState":
      return typeof result.platform === "string";
    case "runSelfTest":
      return result.summary && typeof result.summary.total === "number";
    case "dumpSemantics":
      return typeof result.id === "number" || (result.children !== undefined);
    case "dumpWidgetTree":
      return result.widgetTree !== undefined || result.error !== undefined;
    case "connectProxy":
    case "disconnectProxy":
      return typeof result.status === "string";
    case "getProxyStatus":
      return typeof result === "object" && result !== null;
    case "performSemanticsAction":
      return typeof result.status === "string";
    case "importConfig":
      return typeof result.status === "string";
    default:
      return result !== null && result !== undefined;
  }
}

function summarize(name, result) {
  switch (name) {
    case "getAppState":
      return `${result.platform}, dart ${result.dartVersion || "?"}`;
    case "runSelfTest":
      return `${result.summary?.passed || 0}/${result.summary?.total || 0}`;
    case "dumpSemantics":
      return `${countNodes(result)} nodes`;
    case "dumpWidgetTree":
      return `${(result.widgetTree || "").length} chars`;
    case "connectProxy":
    case "disconnectProxy":
    case "performSemanticsAction":
      return result.status;
    case "getProxyStatus": {
      const cs = result.coreStatus || result.connectionStatus || result.isConnected;
      return cs !== undefined ? String(cs) : "ok";
    }
    default:
      return "ok";
  }
}

function describe(name, result) {
  return summarize(name, result);
}

function countNodes(node) {
  if (!node || typeof node !== "object") return 0;
  let c = 1;
  for (const ch of node.children || []) c += countNodes(ch);
  return c;
}

function truncate(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + "..." : s;
}

// =============================================================================
// Commands
// =============================================================================

async function cmdLaunch(opts, out) {
  out.info(`Launching ${opts.app} with config ${opts.config}`);

  const mgr = new ProxyAppManager({
    app: opts.app,
    config: opts.config,
    headless: opts.headless,
    timeout: opts.timeout,
  });

  out.step("Preparing config");
  const launch = await mgr.launch();
  out.ok(`VM: ${launch.vmUri}, proxy port: ${launch.proxyPort}`);

  const debugResult = await verifyDebugExtensions(
    mgr.bridge,
    mgr.client,
    opts.app,
    out
  );

  const data = {
    app: opts.app,
    vmUri: launch.vmUri,
    proxyPort: launch.proxyPort,
    configDest: launch.configDest,
    proxyUrl: mgr.getProxyUrl(),
    debugExtensions: debugResult,
    pid: mgr.process?.pid,
  };

  out.info(`\n── App Ready ──`);
  out.info(`  VM Service:  ${launch.vmUri}`);
  out.info(`  Proxy URL:   ${mgr.getProxyUrl()}`);
  out.info(`  PID:         ${mgr.process?.pid}`);
  out.info(`  Config:      ${launch.configDest}`);
  out.info(`\n  Press Ctrl+C to stop.`);

  out.final(data);

  const shutdown = async () => {
    out.info("\nShutting down...");
    await mgr.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdTest(opts, out) {
  out.info(`Testing ${opts.app} with config ${opts.config}`);

  const mgr = new ProxyAppManager({
    app: opts.app,
    config: opts.config,
    headless: opts.headless,
    timeout: opts.timeout,
  });

  let debugResult = null;

  try {
    // 1. Launch
    out.step("Launch");
    const launch = await mgr.launch();
    out.ok(`VM: ${launch.vmUri}, port: ${launch.proxyPort}`);

    // 2. Verify debug extensions
    debugResult = await verifyDebugExtensions(mgr.bridge, mgr.client, opts.app, out);

    // 3. Connect proxy
    out.step("connectProxy");
    const connect = await mgr.connectProxy();
    const connected =
      connect?.status === "connected" ||
      connect?.status === "connection_pending" ||
      connect?.status === "already_connected";
    if (connected) {
      out.ok(connect.status);
    } else {
      out.fail(connect?.status || "unknown");
    }

    // 4. Proxy status
    out.step("getProxyStatus");
    const status = await mgr.getStatus();
    out.ok(status?.isStart ? "running" : status?.isConnected ? "connected" : "ok");

    // 5. Self-test
    out.step("runSelfTest");
    const self = await mgr.runSelfTest();
    const total = self?.summary?.total || 0;
    const selfPassed = self?.summary?.passed || 0;
    if (selfPassed === total && total > 0) {
      out.ok(`${selfPassed}/${total}`);
    } else {
      out.fail(`${selfPassed}/${total}`);
    }

    // 6. Disconnect
    out.step("disconnectProxy");
    const disc = await mgr.disconnectProxy();
    const disconnected =
      disc?.status === "disconnected" ||
      disc?.status === "already_disconnected" ||
      disc?.status === "disconnect_pending";
    if (disconnected) {
      out.ok(disc.status);
    } else {
      out.fail(disc?.status || "unknown");
    }

    const data = {
      app: opts.app,
      vmUri: launch.vmUri,
      proxyPort: launch.proxyPort,
      proxyUrl: mgr.getProxyUrl(),
      debugExtensions: debugResult,
      connect,
      status,
      selfTest: self,
      disconnect: disc,
    };

    if (opts.keepRunning) {
      out.info(`\n── App left running ──`);
      out.info(`  VM: ${launch.vmUri}  Proxy: ${mgr.getProxyUrl()}`);
      out.final(data);
      return;
    }

    // 7. Shutdown
    out.step("Shutdown");
    await mgr.shutdown();
    out.ok("cleaned up");

    out.info(`\n${opts.app}: test complete`);
    if (!opts.json) {
      out.info(`  Debug extensions: ${debugResult?.passed || 0}/${debugResult?.total || 0}`);
      out.info(`  Proxy: ${mgr.getProxyUrl()}`);
    }
    out.final(data);
  } catch (err) {
    out.fail(err.message);
    if (!opts.json) console.error(err.stack);
    try { await mgr.shutdown(); } catch (_) {}
    out.final({ error: err.message, debugExtensions: debugResult });
    process.exit(1);
  }
}

async function cmdFull(opts, out) {
  out.info(`Full test: ${opts.app} with config ${opts.config}`);

  const mgr = new ProxyAppManager({
    app: opts.app,
    config: opts.config,
    headless: opts.headless,
    timeout: opts.timeout,
  });

  let debugResult = null;

  try {
    // 1. Launch
    out.step("Launch");
    const launch = await mgr.launch();
    out.ok(`VM: ${launch.vmUri}`);

    // 2. Debug verification
    debugResult = await verifyDebugExtensions(mgr.bridge, mgr.client, opts.app, out);

    // 3. Connect
    out.step("connectProxy");
    const connect = await mgr.connectProxy();
    out.ok(connect?.status || "ok");

    // 4. Status
    out.step("getProxyStatus");
    const status = await mgr.getStatus();
    out.ok(status ? "ok" : "empty");

    // 5. Self-test
    out.step("runSelfTest");
    const self = await mgr.runSelfTest();
    out.ok(`${self?.summary?.passed || 0}/${self?.summary?.total || 0}`);

    // 6. Semantics
    out.step("dumpSemantics");
    const sem = await mgr.dumpSemantics();
    const nodes = countNodes(sem);
    out.ok(`${nodes} nodes`);

    // 7. Widget tree
    out.step("dumpWidgetTree");
    const wt = await mgr.dumpWidgetTree();
    const wtLen = (wt?.widgetTree || "").length;
    out.ok(`${wtLen} chars${wtLen === 0 ? " (profile mode)" : ""}`);

    // 8. Generic call
    out.step("getAppState (generic)");
    const appState = await mgr.callExtension("getAppState");
    out.ok(appState?.platform || "ok");

    // 9. Disconnect
    out.step("disconnectProxy");
    const disc = await mgr.disconnectProxy();
    out.ok(disc?.status || "ok");

    const data = {
      app: opts.app,
      vmUri: launch.vmUri,
      proxyPort: launch.proxyPort,
      proxyUrl: mgr.getProxyUrl(),
      debugExtensions: debugResult,
      connect,
      status,
      selfTest: self,
      semantics: { nodes },
      widgetTree: { chars: wtLen },
      appState,
      disconnect: disc,
    };

    if (opts.keepRunning) {
      out.info(`\n── App left running — VM: ${launch.vmUri} ──`);
      out.final(data);
      return;
    }

    // 10. Shutdown
    out.step("Shutdown");
    await mgr.shutdown();
    out.ok("cleaned up");

    out.info(`\n${opts.app}: full test complete`);
    if (!opts.json) {
      out.info(`  Debug: ${debugResult?.passed || 0}/${debugResult?.total || 0} extensions`);
      out.info(`  Proxy: ${mgr.getProxyUrl()}`);
    }
    out.final(data);
  } catch (err) {
    out.fail(err.message);
    if (!opts.json) console.error(err.stack);
    try { await mgr.shutdown(); } catch (_) {}
    out.final({ error: err.message, debugExtensions: debugResult });
    process.exit(1);
  }
}

async function cmdDebugVerify(opts, out) {
  if (!opts.vmUri) {
    console.error("ERROR: --vm-uri is required for debug-verify mode");
    process.exit(1);
  }

  out.info(`Connecting to ${opts.vmUri}...`);

  const bridge = new VmBridge(opts.vmUri, { timeout: opts.timeout });
  await bridge.connect();

  // Determine which app by probing extensions
  let appName = opts.app;
  let client = null;

  for (const c of listClients()) {
    try {
      const probe = await bridge.call(`ext.${c.app}.getAppState`, {
        isolateId: bridge._isolateId,
      });
      if (probe && !probe.error) {
        appName = c.app;
        const { registry } = require("./proxy-app-manager/src/clients/registry");
        const ClientClass = registry.get(c.app);
        client = new ClientClass(process.cwd());
        break;
      }
    } catch (_) {}
  }

  if (!client) {
    const { BaseClient } = require("./proxy-app-manager/src/BaseClient");
    client = new (class extends BaseClient {
      static get app() { return "unknown"; }
      get extensions() {
        const prefix = `ext.${appName}`;
        return new Map(Object.entries({
          getAppState:           { method: `${prefix}.getAppState`,           timeout: 10000 },
          runSelfTest:           { method: `${prefix}.runSelfTest`,           timeout: 15000 },
          dumpSemantics:         { method: `${prefix}.dumpSemantics`,         timeout: 15000 },
          dumpWidgetTree:        { method: `${prefix}.dumpWidgetTree`,        timeout: 15000 },
          getProxyStatus:        { method: `${prefix}.getProxyStatus`,        timeout: 10000 },
          connectProxy:          { method: `${prefix}.connectProxy`,          timeout: 30000 },
          disconnectProxy:       { method: `${prefix}.disconnectProxy`,       timeout: 15000 },
          performSemanticsAction:{ method: `${prefix}.performSemanticsAction`,timeout: 15000 },
        }));
      }
    })();
  }

  out.info(`Detected app: ${appName}`);

  const debugResult = await verifyDebugExtensions(bridge, client, appName, out);
  await bridge.disconnect();

  const allOk = debugResult.failed === 0;
  out.info(`\n${allOk ? "All debug extensions working" : `${debugResult.failed} extension(s) failed`}`);
  out.final({ app: appName, vmUri: opts.vmUri, debugExtensions: debugResult });

  if (!allOk) process.exit(1);
}

async function cmdShutdown(opts, out) {
  if (!opts.vmUri) {
    console.error("ERROR: --vm-uri is required for shutdown mode");
    process.exit(1);
  }

  out.info(`Connecting to ${opts.vmUri} for shutdown...`);

  const bridge = new VmBridge(opts.vmUri, { timeout: opts.timeout });

  try {
    await bridge.connect();

    out.step("Detecting app");
    let appName = opts.app;
    for (const c of listClients()) {
      try {
        const probe = await bridge.call(`ext.${c.app}.getAppState`, {
          isolateId: bridge._isolateId,
        });
        if (probe && !probe.error) {
          appName = c.app;
          break;
        }
      } catch (_) {}
    }
    out.ok(appName);

    out.step("disconnectProxy");
    try {
      const disc = await bridge.callExtension(`ext.${appName}.disconnectProxy`);
      out.ok(disc?.status || "called");
    } catch (err) {
      out.fail(err.message);
    }

    await bridge.disconnect();
  } catch (err) {
    out.fail(`VM connect failed: ${err.message}`);
    out.final({ error: err.message });
    process.exit(1);
  }

  // Kill the process by VM URI port
  const port = opts.vmUri.match(/:(\d+)\//)?.[1];
  if (port) {
    try {
      const { execSync } = require("child_process");
      const lsof = execSync(
        `ss -tlnp 'sport = :${port}' 2>/dev/null | grep -oP 'pid=\\K\\d+' || true`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();
      if (lsof) {
        out.step("Killing app process");
        process.kill(parseInt(lsof, 10), "SIGTERM");
        out.ok(`PID ${lsof}`);
      }
    } catch (_) {}
  }

  out.info("\nShutdown complete.");
  out.final({ app: appName, vmUri: opts.vmUri, shutdown: true });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const opts = parseArgs();
  const out = new Output(opts.json);

  const needsConfig = ["launch", "test", "full"];
  if (needsConfig.includes(opts.mode) && !opts.config) {
    console.error(`ERROR: --config is required for ${opts.mode} mode`);
    process.exit(1);
  }

  const needsApp = ["launch", "test", "full"];
  if (needsApp.includes(opts.mode)) {
    const clients = listClients();
    if (!clients.find((c) => c.app === opts.app)) {
      console.error(
        `ERROR: Unknown app "${opts.app}". Available: ${clients.map((c) => c.app).join(", ")}`
      );
      process.exit(1);
    }
  }

  switch (opts.mode) {
    case "launch":       await cmdLaunch(opts, out);      break;
    case "test":         await cmdTest(opts, out);        break;
    case "full":         await cmdFull(opts, out);        break;
    case "debug-verify": await cmdDebugVerify(opts, out); break;
    case "shutdown":     await cmdShutdown(opts, out);    break;
    default:
      console.error(`ERROR: Unknown mode "${opts.mode}". Use: launch, test, full, debug-verify, shutdown`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
