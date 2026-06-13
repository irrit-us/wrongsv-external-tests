#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { SuiteRunner } = require("./e2e-harness");
const { getClientCapability, SERVER_DEFECTS } = require("./e2e-harness/capabilities");
const { buildScenarios } = require("./e2e-harness/scenarios");

function parseArgs(argv) {
  const opts = {
    trafficDuration: 1500,
    userDuration: 1500,
    metricsPort: 59100,
    targetPortStart: 3300,
    withBrowser: false,
    profiles: ["local-quick"],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--client":
        opts.client = next;
        i++;
        break;
      case "--output-dir":
        opts.outputDir = path.resolve(next);
        i++;
        break;
      case "--wrongsv-repo":
        opts.wrongsvRepo = path.resolve(next);
        i++;
        break;
      case "--traffic-duration":
        opts.trafficDuration = Number(next);
        i++;
        break;
      case "--user-duration":
        opts.userDuration = Number(next);
        i++;
        break;
      case "--metrics-port":
        opts.metricsPort = next === "none" ? null : Number(next);
        i++;
        break;
      case "--target-port-start":
        opts.targetPortStart = Number(next);
        i++;
        break;
      case "--scenarios":
        opts.scenarios = next.split(",").filter(Boolean);
        i++;
        break;
      case "--profiles":
        opts.profiles = next.split(",").filter(Boolean);
        i++;
        break;
      case "--with-browser":
        opts.withBrowser = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!opts.client) {
    throw new Error("--client is required");
  }
  return opts;
}

function printHelp() {
  console.log(`run-client-matrix.js

Usage:
  node run-client-matrix.js --client hiddify [options]

Options:
  --client <name>            flclash | clash-verge-rev | hiddify | sing-box | xray-core | v2ray
  --output-dir <path>        matrix results directory
  --wrongsv-repo <path>      wrongsv repo root
  --traffic-duration <ms>    duration per protocol scenario traffic run
  --user-duration <ms>       duration for the browser scenario
  --metrics-port <port>      wrongsv metrics port, or "none"
  --target-port-start <n>    first local target-server port
  --scenarios <csv>          optional scenario subset
  --profiles <csv>           traffic profiles per scenario (default: local-quick)
  --with-browser             run the client's designated browser scenario
`);
}

function scenarioPassed(result) {
  const trafficHealthy = result.traffic.every((item) => {
    const metrics = item.report.metrics;
    return metrics.totalRequests > 0 && metrics.errors.rate < 0.5;
  });
  return result.compatibility.ok && trafficHealthy;
}

function summarizeScenario(result) {
  return {
    compatibilityOk: result.compatibility.ok,
    compatibility: result.compatibility.results,
    traffic: result.traffic.map((item) => ({
      profile: item.profile,
      totalRequests: item.report.metrics.totalRequests,
      p50LatencyMs: item.report.metrics.latency.p50,
      p95LatencyMs: item.report.metrics.latency.p95,
      throughputReqPerSec: item.report.metrics.throughput.requestsPerSec,
      errorRate: item.report.metrics.errors.rate,
      metricsDelta: item.metricsDelta,
    })),
    userBehavior: result.userBehavior.map((item) => ({
      behavior: item.behavior,
      totalActions: item.report.summary.totalActions,
      errors: item.report.summary.errors,
      totalRequests: item.report.summary.totalRequests,
      failedRequests: item.report.summary.failedRequests,
      metricsDelta: item.metricsDelta,
    })),
  };
}

function writeMarkdown(outputPath, matrix, capability) {
  let md = `# Client Capability Matrix — ${capability.label}\n\n`;
  if (capability.note) {
    md += `> ${capability.note}\n\n`;
  }
  md += `## Scenario Results\n\n`;
  for (const scenario of matrix.scenarios) {
    md += `### ${scenario.label}\n\n`;
    md += `- Status: \`${scenario.status}\`\n`;
    if (scenario.error) {
      md += `- Error: \`${scenario.error}\`\n`;
    }
    if (scenario.summary) {
      md += `- Compatibility: \`${scenario.summary.compatibilityOk}\`\n`;
      for (const traffic of scenario.summary.traffic) {
        md += `- Traffic ${traffic.profile}: p50 ${traffic.p50LatencyMs}ms / p95 ${traffic.p95LatencyMs}ms / ${traffic.throughputReqPerSec} req/s / error ${traffic.errorRate}\n`;
      }
      for (const behavior of scenario.summary.userBehavior) {
        md += `- Browser ${behavior.behavior}: ${behavior.totalActions} actions / ${behavior.errors} errors / ${behavior.totalRequests} requests\n`;
      }
    }
    md += `\n`;
  }

  md += `## Server Defects\n\n`;
  for (const defect of matrix.serverDefects) {
    md += `- **${defect.id}**: ${defect.title}\n`;
    md += `  ${defect.detail}\n`;
  }

  if (capability.harnessGaps?.length) {
    md += `\n## Harness Gaps\n\n`;
    for (const gap of capability.harnessGaps) {
      md += `- ${gap}\n`;
    }
  }

  fs.writeFileSync(outputPath, md, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname);
  const wrongsvRepo = options.wrongsvRepo || path.resolve(repoRoot, "..", "wrongsv");
  const capability = getClientCapability(options.client);
  const scenarios = buildScenarios(wrongsvRepo);
  const scenarioIds = options.scenarios || capability.runnableScenarios;
  const outputDir =
    options.outputDir ||
    path.join(
      repoRoot,
      "results",
      `${options.client}-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}`
    );
  fs.mkdirSync(outputDir, { recursive: true });

  const matrix = {
    client: options.client,
    label: capability.label,
    generatedAt: new Date().toISOString(),
    scenarios: [],
    serverDefects: capability.serverDefects.map((id) => SERVER_DEFECTS[id]).filter(Boolean),
    harnessGaps: capability.harnessGaps || [],
  };

  for (const [index, scenarioId] of scenarioIds.entries()) {
    const scenario = scenarios[scenarioId];
    if (!scenario) {
      matrix.scenarios.push({
        id: scenarioId,
        label: scenarioId,
        status: "unknown_scenario",
      });
      continue;
    }

    const scenarioOutputDir = path.join(outputDir, scenarioId);
    const runner = new SuiteRunner({
      client: options.client,
      scenario,
      repoRoot,
      wrongsvRepo,
      wrongsvConfig: scenario.configPath,
      outputDir: scenarioOutputDir,
      serverName: scenario.serverName || "localhost",
      metricsPort: options.metricsPort,
      targetPort: options.targetPortStart + index,
      trafficDuration: options.trafficDuration,
      userDuration: options.userDuration,
      trafficProfiles: options.profiles,
      userBehaviors:
        options.withBrowser &&
        capability.browserScenario === scenarioId &&
        scenario.browserBehavior
          ? [scenario.browserBehavior]
          : [],
    });

    try {
      const result = await runner.run();
      const passed = scenarioPassed(result);
      const expectedDefect = scenario.expectedDefectId;
      const mappedDefect = capability.scenarioDefects?.[scenario.id];
      matrix.scenarios.push({
        id: scenario.id,
        label: scenario.label,
        status: expectedDefect || mappedDefect
          ? passed
            ? "unexpected_pass"
            : "defect_confirmed"
          : passed
            ? "passed"
            : "failed",
        expectedDefectId: expectedDefect || mappedDefect || null,
        summary: summarizeScenario(result),
      });
    } catch (error) {
      const mappedDefect = capability.scenarioDefects?.[scenario.id];
      matrix.scenarios.push({
        id: scenario.id,
        label: scenario.label,
        status: scenario.expectedDefectId || mappedDefect ? "defect_confirmed" : "failed",
        expectedDefectId: scenario.expectedDefectId || mappedDefect || null,
        error: error.message,
      });
    }
  }

  fs.writeFileSync(path.join(outputDir, "matrix.json"), JSON.stringify(matrix, null, 2), "utf8");
  writeMarkdown(path.join(outputDir, "matrix.md"), matrix, capability);

  console.log(
    JSON.stringify(
      {
        client: matrix.client,
        outputDir,
        passed: matrix.scenarios.filter((item) => item.status === "passed").length,
        failed: matrix.scenarios.filter((item) => item.status === "failed").length,
        confirmedDefects: matrix.scenarios.filter((item) => item.status === "defect_confirmed")
          .length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
