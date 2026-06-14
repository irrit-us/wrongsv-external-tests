#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { buildScenarios } = require("./e2e-harness/scenarios");
const {
  buildClientRuntimeConfig,
  buildTargetCatalog,
  runtimeConfigPath,
} = require("./e2e-harness/config-builders");
const { createClientRunner } = require("./e2e-harness/client-runners");
const { WrongsvMetricsClient } = require("./e2e-harness/metrics");
const { RemoteTargetServer, RemoteWrongsvServer, SshTunnel, resolveServerHost } = require("./e2e-harness/remote-servers");
const { ProxyFetchClient, BenchmarkRunner } = require("./proxy-testing-framework/traffic-simulator");
const { UserSimulator } = require("./proxy-testing-framework/user-simulator");

function resolveWrongsvBinary(wrongsvRepo, requestedPath) {
  if (requestedPath) {
    return path.resolve(requestedPath);
  }
  const candidates = [
    path.join(wrongsvRepo, "target", "x86_64-unknown-linux-musl", "release", "wrongsv"),
    path.join(wrongsvRepo, "target", "release", "wrongsv"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to locate wrongsv binary. Checked: ${candidates.join(", ")}`);
}

function parseArgs(argv) {
  const opts = {
    client: "flclash",
    remoteHost: "tencentde",
    remoteDir: `/root/wrongsv-remote-suite-${Date.now()}`,
    wrongsvConfig: path.resolve(__dirname, "..", "wrongsv", "configs", "tls-vision.toml"),
    listenPort: 50443,
    targetPort: 3300,
    metricsPort: 59100,
    localMetricsPort: 59210,
    serverName: "localhost",
    trafficDuration: 8000,
    userDuration: 8000,
    trafficProfiles: ["local-general", "local-download-heavy", "local-session-churn"],
    userBehaviors: ["web-browsing", "download-heavy", "rapid-switching", "form-interaction"],
    pingIntervalSec: 0.2,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--client":
        opts.client = next;
        i++;
        break;
      case "--remote-host":
        opts.remoteHost = next;
        i++;
        break;
      case "--remote-dir":
        opts.remoteDir = next;
        i++;
        break;
      case "--wrongsv-config":
        opts.wrongsvConfig = path.resolve(next);
        i++;
        break;
      case "--local-binary":
        opts.localBinary = path.resolve(next);
        i++;
        break;
      case "--listen-port":
        opts.listenPort = Number(next);
        i++;
        break;
      case "--target-port":
        opts.targetPort = Number(next);
        i++;
        break;
      case "--metrics-port":
        opts.metricsPort = Number(next);
        i++;
        break;
      case "--local-metrics-port":
        opts.localMetricsPort = Number(next);
        i++;
        break;
      case "--servername":
        opts.serverName = next;
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
      case "--profiles":
        opts.trafficProfiles = next.split(",").filter(Boolean);
        i++;
        break;
      case "--behaviors":
        opts.userBehaviors = next.split(",").filter(Boolean);
        i++;
        break;
      case "--output-dir":
        opts.outputDir = path.resolve(next);
        i++;
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
  console.log(`run-remote-flclash-suite.js

Usage:
  node run-remote-flclash-suite.js [options]

Options:
  --client <name>             flclash | clash-verge-rev
  --remote-host <alias>       ssh host alias (default: tencentde)
  --remote-dir <path>         remote deployment directory
  --wrongsv-config <path>     wrongsv TOML config (default: tls-vision.toml)
  --local-binary <path>       wrongsv binary to deploy (default: prefer musl release)
  --listen-port <port>        remote wrongsv listen port (default: 50443)
  --target-port <port>        remote target server port (default: 3300)
  --metrics-port <port>       remote wrongsv metrics port (default: 59100)
  --local-metrics-port <port> local forwarded metrics port (default: 59210)
  --servername <name>         TLS server name for generated config
  --traffic-duration <ms>     duration per traffic profile (default: 8000)
  --user-duration <ms>        duration per browser behavior (default: 8000)
  --profiles <csv>            traffic profiles
  --behaviors <csv>           browser behaviors
  --output-dir <path>         results directory
`);
}

async function runCompatibilityProbe(proxyUrl, baseUrl) {
  const client = new ProxyFetchClient(proxyUrl, { timeout: 15000 });
  const targets = [
    `${baseUrl}/api/status`,
    `${baseUrl}/page/news`,
    `${baseUrl}/download/65536`,
  ];
  const results = [];
  for (const url of targets) {
    try {
      const response = await client.fetch(url);
      results.push({
        url,
        status: response.status,
        ttfb: response.timing.ttfb,
        total: response.timing.total,
        bodySize: response.timing.bodySize,
      });
    } catch (error) {
      results.push({
        url,
        status: 0,
        error: error.message,
      });
    }
  }
  return {
    ok: results.every((item) => item.status >= 200 && item.status < 400),
    results,
  };
}

function parsePingOutput(text) {
  const packetMatch = text.match(/(\d+)\s+packets transmitted,\s+(\d+)\s+received,.*?([0-9.]+)% packet loss/);
  const rttMatch = text.match(/rtt min\/avg\/max\/(?:mdev|stddev) = ([0-9.]+)\/([0-9.]+)\/([0-9.]+)\/([0-9.]+)/);
  return {
    transmitted: packetMatch ? Number(packetMatch[1]) : 0,
    received: packetMatch ? Number(packetMatch[2]) : 0,
    lossRate: packetMatch ? Number(packetMatch[3]) / 100 : null,
    rttMs: rttMatch
      ? {
          min: Number(rttMatch[1]),
          avg: Number(rttMatch[2]),
          max: Number(rttMatch[3]),
          mdev: Number(rttMatch[4]),
        }
      : null,
    raw: text,
  };
}

function runPingLossTest(host, durationMs, intervalSec, outputPath) {
  const count = Math.max(20, Math.ceil(durationMs / (intervalSec * 1000)) + 10);
  return new Promise((resolve) => {
    const args = ["-n", "-i", String(intervalSec), "-c", String(count), host];
    const child = spawn("ping", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", () => {
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      fs.writeFileSync(outputPath, combined, "utf8");
      resolve(parsePingOutput(combined));
    });
  });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function runWithTimeout(label, timeoutMs, work, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      Promise.resolve()
        .then(() => (onTimeout ? onTimeout() : undefined))
        .catch(() => undefined)
        .finally(() => {
          const error = new Error(`${label} timed out after ${timeoutMs}ms`);
          error.code = "TIMEOUT";
          reject(error);
        });
    }, timeoutMs);

    Promise.resolve()
      .then(work)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = __dirname;
  const wrongsvRepo = path.resolve(repoRoot, "..", "wrongsv");
  const localBinary = resolveWrongsvBinary(wrongsvRepo, options.localBinary);
  const outputDir =
    options.outputDir ||
    path.join(
      repoRoot,
      "results",
      `remote-${options.client}-${new Date().toISOString().replace(/[:.]/g, "-")}`
    );
  fs.mkdirSync(outputDir, { recursive: true });

  const serverHost = resolveServerHost(options.remoteHost);
  const remoteBaseUrl = `http://127.0.0.1.nip.io:${options.targetPort}`;
  const progressPath = path.join(outputDir, "progress.json");
  const result = {
    client: options.client,
    generatedAt: new Date().toISOString(),
    status: "initializing",
    remote: {
      hostAlias: options.remoteHost,
      host: serverHost,
      deployDir: options.remoteDir,
      binaryPath: localBinary,
      wrongsvConfig: options.wrongsvConfig,
      listenPort: options.listenPort,
      targetPort: options.targetPort,
      metricsPort: options.metricsPort,
      targetBaseUrl: remoteBaseUrl,
    },
    clientRuntimeConfig: null,
    launch: null,
    compatibility: null,
    traffic: [],
    userBehavior: [],
    packetLoss: null,
  };
  const writeProgress = () => writeJson(progressPath, result);
  const wrongsv = new RemoteWrongsvServer({
    host: options.remoteHost,
    serverHost,
    remoteDir: options.remoteDir,
    localBinary,
    baseConfigPath: options.wrongsvConfig,
    outputDir,
    listenPort: options.listenPort,
    metricsPort: options.metricsPort,
    serverName: options.serverName,
  });
  const targetServer = new RemoteTargetServer({
    host: options.remoteHost,
    remoteDir: options.remoteDir,
    scriptPath: path.join(repoRoot, "proxy-testing-framework", "local-test-server.js"),
    port: options.targetPort,
    outputDir,
  });
  const metricsTunnel = new SshTunnel({
    host: options.remoteHost,
    localPort: options.localMetricsPort,
    remotePort: options.metricsPort,
    logPath: path.join(outputDir, "metrics-tunnel.log"),
  });

  let clientRunner;
  const metricsClient = new WrongsvMetricsClient({
    url: `http://127.0.0.1:${options.localMetricsPort}/metrics`,
  });

  try {
    writeProgress();
    await targetServer.start();
    await wrongsv.start();
    await metricsTunnel.start();

    const rawClientConfig = wrongsv.generateClientConfig("mihomo", {
      clientName: `${options.client}-remote-wrongsv`,
      serverHost,
      serverName: options.serverName,
    });
    const scenario = {
      ...buildScenarios(wrongsvRepo).vless_tls_vision,
      targetBaseUrl: remoteBaseUrl,
    };
    const runtimeConfig = buildClientRuntimeConfig({
      client: options.client,
      rawConfig: rawClientConfig,
      clientName: `${options.client}-remote-wrongsv`,
      scenario,
      serverPort: options.listenPort,
      targetPort: options.targetPort,
    });
    const configPath = runtimeConfigPath(outputDir, options.client, runtimeConfig.extension);
    fs.writeFileSync(configPath, runtimeConfig.content, "utf8");
    result.clientRuntimeConfig = configPath;
    result.status = "starting-client";
    writeProgress();

    clientRunner = createClientRunner({
      repoRoot,
      client: options.client,
      configPath,
      outputDir,
      runnerOptions: runtimeConfig.runnerOptions,
    });
    const launch = await clientRunner.start();
    result.launch = launch;
    result.status = "compatibility";
    writeProgress();

    const totalPlannedDuration =
      options.trafficProfiles.length * options.trafficDuration +
      options.userBehaviors.length * options.userDuration;
    const pingPromise = runPingLossTest(
      serverHost,
      Math.max(totalPlannedDuration, 30000),
      options.pingIntervalSec,
      path.join(outputDir, "ping.log")
    );

    const compatibilityBefore = await metricsClient.snapshot();
    const compatibility = await runCompatibilityProbe(clientRunner.getProxyUrl(), remoteBaseUrl);
    const compatibilityAfter = await metricsClient.snapshot();
    result.compatibility = {
      ...compatibility,
      metricsDelta: WrongsvMetricsClient.delta(compatibilityBefore, compatibilityAfter),
    };
    result.status = "traffic";
    writeProgress();

    for (const profile of options.trafficProfiles) {
      const before = await metricsClient.snapshot();
      let report;
      try {
        report = await runWithTimeout(
          `traffic profile ${profile}`,
          Math.max(options.trafficDuration * 2, options.trafficDuration + 30000),
          () =>
            new BenchmarkRunner({
              proxy: clientRunner.getProxyUrl(),
              profile,
              duration: options.trafficDuration,
              baseUrl: remoteBaseUrl,
            }).run()
        );
      } catch (error) {
        report = {
          error: error.message,
          timedOut: error.code === "TIMEOUT",
        };
      }
      const after = await metricsClient.snapshot();
      result.traffic.push({
        profile,
        report,
        metricsDelta: WrongsvMetricsClient.delta(before, after),
      });
      result.status = `traffic:${profile}`;
      writeProgress();
    }

    const targetCatalog = buildTargetCatalog(remoteBaseUrl);
    for (const behavior of options.userBehaviors) {
      const before = await metricsClient.snapshot();
      const simulator = new UserSimulator({
        proxy: clientRunner.getProxyUrl(),
        behavior,
        duration: options.userDuration,
        recordNetwork: true,
        headless: true,
        targets: targetCatalog,
        proxyLocalTargets: true,
      });
      try {
        const report = await runWithTimeout(
          `user behavior ${behavior}`,
          Math.max(options.userDuration * 2, options.userDuration + 40000),
          () => simulator.run(),
          () => simulator.close()
        );
        const after = await metricsClient.snapshot();
        result.userBehavior.push({
          behavior,
          report,
          metricsDelta: WrongsvMetricsClient.delta(before, after),
        });
      } catch (error) {
        const after = await metricsClient.snapshot();
        result.userBehavior.push({
          behavior,
          report: {
            behavior,
            duration: options.userDuration,
            error: error.message,
            timedOut: error.code === "TIMEOUT",
          },
          metricsDelta: WrongsvMetricsClient.delta(before, after),
        });
      } finally {
        await simulator.close();
      }
      result.status = `behavior:${behavior}`;
      writeProgress();
    }

    result.status = "awaiting-ping";
    writeProgress();
    result.packetLoss = await pingPromise;
    result.status = "complete";
    writeProgress();

    writeJson(path.join(outputDir, "report.json"), result);

    console.log(
      JSON.stringify(
        {
          client: result.client,
          outputDir,
          compatibilityOk: result.compatibility.ok,
          trafficProfiles: result.traffic.length,
          userBehaviors: result.userBehavior.length,
          packetLossRate: result.packetLoss.lossRate,
        },
        null,
        2
      )
    );
  } finally {
    if (clientRunner) {
      await clientRunner.stop();
    }
    await metricsTunnel.stop();
    await wrongsv.stop();
    await targetServer.stop();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
