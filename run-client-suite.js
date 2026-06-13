#!/usr/bin/env node

const path = require("path");
const { SuiteRunner } = require("./e2e-harness");

function parseArgs(argv) {
  const opts = {
    client: "flclash",
    metricsPort: 59100,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--client":
        opts.client = next;
        i++;
        break;
      case "--wrongsv-config":
        opts.wrongsvConfig = path.resolve(next);
        i++;
        break;
      case "--output-dir":
        opts.outputDir = path.resolve(next);
        i++;
        break;
      case "--metrics-port":
        opts.metricsPort = next === "none" ? null : Number(next);
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
      case "--server-host":
        opts.serverHost = next;
        i++;
        break;
      case "--servername":
        opts.serverName = next;
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
  console.log(`run-client-suite.js

Usage:
  node run-client-suite.js --client flclash [options]

Options:
  --client <name>           flclash | clash-verge-rev | hiddify | xray-core | v2ray | sing-box
  --wrongsv-config <path>   wrongsv TOML config (default: ../wrongsv/configs/tls-vision.toml)
  --output-dir <path>       results directory
  --metrics-port <port>     wrongsv metrics port, or "none" (default: 59100)
  --listen-port <port>      wrongsv listen port (default: 50443)
  --target-port <port>      local target server port (default: 3099)
  --traffic-duration <ms>   duration per traffic profile (default: 12000)
  --user-duration <ms>      duration per browser behavior (default: 12000)
  --profiles <csv>          traffic profiles to run
  --behaviors <csv>         browser behaviors to run
  --server-host <host>      server host for generated configs (default: 127.0.0.1)
  --servername <name>       TLS servername for generated configs (default: localhost)
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await new SuiteRunner(options).run();
  console.log(
    JSON.stringify(
      {
        client: result.client,
        outputDir: options.outputDir || null,
        compatibilityOk: result.compatibility.ok,
        trafficProfiles: result.traffic.map((item) => item.profile),
        userBehaviors: result.userBehavior.map((item) => item.behavior),
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
