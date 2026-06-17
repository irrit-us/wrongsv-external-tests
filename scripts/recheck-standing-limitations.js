#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  CLIENT_CAPABILITIES,
  INTENTIONALLY_UNTRACKED_SCENARIOS,
} = require("../e2e-harness/capabilities");

function parseArgs(argv) {
  const opts = {
    outputRoot: null,
    only: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--output-root":
        opts.outputRoot = path.resolve(next);
        i++;
        break;
      case "--only":
        opts.only = next.split(",").map((item) => item.trim()).filter(Boolean);
        i++;
        break;
      case "--dry-run":
        opts.dryRun = true;
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
  console.log(`recheck-standing-limitations.js

Usage:
  node scripts/recheck-standing-limitations.js [options]

Options:
  --output-root <path>   parent directory for results
  --only <csv>           subset: hiddify-anytls,xray-webtransport,v2ray-webtransport
  --dry-run              print the planned commands without executing them
`);
}

function plannedRuns(repoRoot, outputRoot) {
  return [
    {
      id: "hiddify-anytls",
      client: "hiddify",
      expectedStatus: "gap_confirmed",
      expectedFlag: "expectedGap",
      expectedSummaryField: "confirmedGaps",
      scenarioId: "anytls_tcp",
      reasonField: "gapReason",
      expectedReason:
        CLIENT_CAPABILITIES.hiddify.harnessGapReasons.anytls_tcp,
      args: [
        "run-client-matrix.js",
        "--client",
        "hiddify",
        "--scenarios",
        "anytls_tcp",
        "--listen-port-start",
        "50643",
        "--target-port-start",
        "3500",
        "--metrics-port",
        "59222",
        "--output-dir",
        path.join(outputRoot, "hiddify-anytls"),
      ],
    },
    {
      id: "xray-webtransport",
      client: "xray-core",
      expectedStatus: "untracked_confirmed",
      expectedFlag: "expectedUntracked",
      expectedSummaryField: "confirmedUntracked",
      scenarioId: "vless_webtransport",
      reasonField: "untrackedReason",
      expectedReason:
        INTENTIONALLY_UNTRACKED_SCENARIOS.vless_webtransport.reason,
      args: [
        "run-client-matrix.js",
        "--client",
        "xray-core",
        "--scenarios",
        "vless_webtransport",
        "--include-untracked",
        "--listen-port-start",
        "50443",
        "--target-port-start",
        "3300",
        "--metrics-port",
        "59220",
        "--output-dir",
        path.join(outputRoot, "xray-webtransport"),
      ],
    },
    {
      id: "v2ray-webtransport",
      client: "v2ray",
      expectedStatus: "untracked_confirmed",
      expectedFlag: "expectedUntracked",
      expectedSummaryField: "confirmedUntracked",
      scenarioId: "vless_webtransport",
      reasonField: "untrackedReason",
      expectedReason:
        INTENTIONALLY_UNTRACKED_SCENARIOS.vless_webtransport.reason,
      args: [
        "run-client-matrix.js",
        "--client",
        "v2ray",
        "--scenarios",
        "vless_webtransport",
        "--include-untracked",
        "--listen-port-start",
        "50543",
        "--target-port-start",
        "3400",
        "--metrics-port",
        "59221",
        "--output-dir",
        path.join(outputRoot, "v2ray-webtransport"),
      ],
    },
  ];
}

function runNode(repoRoot, args) {
  const stdout = execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

function readMatrix(outputDir) {
  return JSON.parse(fs.readFileSync(path.join(outputDir, "matrix.json"), "utf8"));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const outputRoot =
    opts.outputRoot ||
    path.join(
      repoRoot,
      "results",
      `standing-limitations-${new Date().toISOString().replace(/[:.]/g, "-")}`
    );
  const selected = new Set(opts.only || []);
  const runs = plannedRuns(repoRoot, outputRoot).filter(
    (item) => selected.size === 0 || selected.has(item.id)
  );

  if (runs.length === 0) {
    throw new Error("No matching standing limitation runs selected");
  }

  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          outputRoot,
          runs: runs.map((item) => ({
            id: item.id,
            client: item.client,
            expectedStatus: item.expectedStatus,
            scenarioId: item.scenarioId,
            command: `node ${item.args.join(" ")}`,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  fs.mkdirSync(outputRoot, { recursive: true });

  const summary = {
    outputRoot,
    runs: [],
  };

  for (const run of runs) {
    const commandSummary = runNode(repoRoot, run.args);
    const matrix = readMatrix(path.join(outputRoot, run.id));
    const scenario = matrix.scenarios.find((item) => item.id === run.scenarioId);
    if (!scenario) {
      throw new Error(`${run.id} did not produce scenario ${run.scenarioId}`);
    }
    if (scenario.status !== run.expectedStatus) {
      throw new Error(
        `${run.id} expected status ${run.expectedStatus}, got ${scenario.status}`
      );
    }
    if (scenario[run.expectedFlag] !== true) {
      throw new Error(
        `${run.id} expected ${run.expectedFlag}=true, got ${JSON.stringify(scenario[run.expectedFlag])}`
      );
    }
    const actualReason = scenario[run.reasonField] || null;
    if (actualReason !== run.expectedReason) {
      throw new Error(
        `${run.id} expected ${run.reasonField} ${JSON.stringify(run.expectedReason)}, got ${JSON.stringify(actualReason)}`
      );
    }
    if (commandSummary[run.expectedSummaryField] !== 1) {
      throw new Error(
        `${run.id} expected summary ${run.expectedSummaryField}=1, got ${JSON.stringify(commandSummary[run.expectedSummaryField])}`
      );
    }
    summary.runs.push({
      id: run.id,
      client: run.client,
      outputDir: commandSummary.outputDir,
      summary: commandSummary,
      scenario: {
        id: scenario.id,
        status: scenario.status,
        reason: actualReason,
      },
    });
  }

  fs.writeFileSync(
    path.join(outputRoot, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
