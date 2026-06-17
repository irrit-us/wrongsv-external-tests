#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  inspectKnownCoreClients,
} = require("../e2e-harness/core-binary-inspector");

const DEFAULT_CLIENTS = [
  "clash-verge-rev",
  "sing-box",
  "xray-core",
  "v2ray",
];

function parseArgs(argv) {
  const opts = {
    clients: DEFAULT_CLIENTS,
    outputFile: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--client":
      case "--clients":
        opts.clients = next
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        i++;
        break;
      case "--output-file":
        opts.outputFile = path.resolve(next);
        i++;
        break;
      case "--json":
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`inspect-client-cores.js

Usage:
  node scripts/inspect-client-cores.js [options]

Options:
  --clients <csv>         subset of: clash-verge-rev,sing-box,xray-core,v2ray
  --output-file <path>    also write the JSON summary to this file
  --json                  accepted for symmetry; JSON is always emitted
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const scans = inspectKnownCoreClients(repoRoot, opts.clients);
  const summary = {
    status: "ok",
    inspectedAt: new Date().toISOString(),
    clients: scans,
  };

  if (opts.outputFile) {
    fs.mkdirSync(path.dirname(opts.outputFile), { recursive: true });
    fs.writeFileSync(opts.outputFile, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
