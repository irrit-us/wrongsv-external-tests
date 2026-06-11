#!/usr/bin/env node
/**
 * Smoke test: verify full lifecycle via proxy-app-manager module.
 * Tests: launch → connect → status → selfTest → semantics → disconnect → shutdown
 *
 * Usage: node proxy-app-manager/test-smoke.js [flclash|hiddify]
 */

const { ProxyAppManager, listClients } = require(".");

const APP = process.argv[2] || "flclash";
const CONFIG =
  APP === "hiddify"
    ? "./configs/sample-singbox-config.json"
    : "./configs/sample-clash-config.yaml";

async function main() {
  console.log("=== Proxy App Manager — Smoke Test ===\n");

  // Registry check
  const clients = listClients();
  console.log("Registered clients:", clients.map((c) => c.app).join(", "));

  if (!clients.find((c) => c.app === APP)) {
    console.error(`ERROR: "${APP}" not in registry`);
    process.exit(1);
  }

  // Create manager
  const mgr = new ProxyAppManager({
    app: APP,
    config: CONFIG,
    headless: true,
    timeout: 60000,
  });

  let passed = 0;
  let failed = 0;

  const check = (label, ok, detail = "") => {
    if (ok) {
      console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`);
      passed++;
    } else {
      console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
      failed++;
    }
  };

  try {
    // 1. Launch
    console.log("\n--- Launch ---");
    const launch = await mgr.launch();
    check("VM URI detected", !!launch.vmUri, launch.vmUri);
    check("Proxy port detected", launch.proxyPort > 0, String(launch.proxyPort));

    // 2. Connect proxy
    console.log("\n--- Connect ---");
    const connect = await mgr.connectProxy();
    const connected =
      connect?.status === "connected" ||
      connect?.status === "connection_pending" ||
      connect?.status === "already_connected";
    check("connectProxy", connected, connect?.status || JSON.stringify(connect));

    // 3. Status
    console.log("\n--- Status ---");
    const status = await mgr.getStatus();
    if (APP === "flclash") {
      check("Proxy started (isStart)", status?.isStart === true);
      check("Core running (coreStatus)", !!status?.coreStatus, status?.coreStatus);
    } else {
      check("Proxy connected", status?.isConnected === true);
    }

    // 4. Self test
    console.log("\n--- Self Test ---");
    const self = await mgr.runSelfTest();
    const total = self?.summary?.total || 0;
    const selfPassed = self?.summary?.passed || 0;
    check("runSelfTest", selfPassed === total, `${selfPassed}/${total}`);

    // 5. Semantics dump
    console.log("\n--- Semantics ---");
    const sem = await mgr.dumpSemantics();
    const nodeCount = countNodes(sem);
    check("dumpSemantics", nodeCount > 0, `${nodeCount} nodes`);

    // 6. Generic extension call
    console.log("\n--- Generic Call ---");
    const appState = await mgr.callExtension("getAppState");
    check("getAppState (generic)", !!appState?.platform, appState?.platform);

    // 7. Disconnect
    console.log("\n--- Disconnect ---");
    const disconnect = await mgr.disconnectProxy();
    const disconnected =
      disconnect?.status === "disconnected" ||
      disconnect?.status === "already_disconnected" ||
      disconnect?.status === "disconnect_pending";
    check("disconnectProxy", disconnected, disconnect?.status);

    // 8. Shutdown
    console.log("\n--- Shutdown ---");
    await mgr.shutdown();
    check("shutdown", mgr._launched === false, "process cleaned up");

    // Summary
    console.log(`\n${"═".repeat(40)}`);
    console.log(`  ${APP}: ${passed}/${passed + failed} tests passed`);
    if (failed > 0) {
      console.error(`  ${failed} FAILURES`);
      process.exit(1);
    } else {
      console.log("  All good!");
    }
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    console.error(err.stack);
    try {
      await mgr.shutdown();
    } catch (_) {}
    process.exit(1);
  }
}

function countNodes(node) {
  if (!node || typeof node !== "object") return 0;
  let c = 1;
  const children = node.children || [];
  for (const ch of children) c += countNodes(ch);
  return c;
}

main();
