const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { waitForPort } = require("./client-runners");

function readListenPort(configText) {
  const match = configText.match(/listen\s*=\s*"[^"]+:(\d+)"/);
  if (!match) {
    throw new Error("Unable to determine wrongsv listen port from config");
  }
  return Number(match[1]);
}

function upsertWrongsvConfig(configText, options) {
  let next = configText.replace(
    /^listen\s*=\s*"[^"]+"/m,
    `listen = "${options.listenHost}:${options.listenPort}"`
  );

  if (/\[metrics\]/m.test(next)) {
    next = next.replace(
      /\[metrics\][\s\S]*?(?=\n\[|$)/m,
      options.metricsPort
        ? `[metrics]\nport = ${options.metricsPort}\nbind = "${options.metricsBind}"\n`
        : ""
    );
  } else if (options.metricsPort) {
    next = `${next.trimEnd()}\n\n[metrics]\nport = ${options.metricsPort}\nbind = "${options.metricsBind}"\n`;
  }

  return next.trimEnd() + "\n";
}

class LocalTargetServer {
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.port = options.port || 3099;
    this.process = null;
    this.logPath = path.join(options.outputDir, "local-target-server.log");
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start() {
    const script = path.join(this.repoRoot, "proxy-testing-framework", "local-test-server.js");
    const out = fs.createWriteStream(this.logPath);
    this.process = spawn("node", [script, "--port", String(this.port)], {
      cwd: this.repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process.stdout.on("data", (chunk) => out.write(chunk));
    this.process.stderr.on("data", (chunk) => out.write(chunk));
    await waitForPort("127.0.0.1", this.port, 10000);
  }

  async stop() {
    if (!this.process) return;
    this.process.kill("SIGTERM");
    await new Promise((resolve) => this.process.once("exit", resolve));
    this.process = null;
  }
}

class WrongsvServer {
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.wrongsvRepo = options.wrongsvRepo;
    this.baseConfigPath = path.resolve(options.baseConfigPath);
    this.outputDir = options.outputDir;
    this.listenHost = options.listenHost || "127.0.0.1";
    this.listenPort = options.listenPort || 50443;
    this.metricsPort = options.metricsPort || null;
    this.metricsBind = options.metricsBind || "127.0.0.1";
    this.serverHost = options.serverHost || "127.0.0.1";
    this.serverName = options.serverName || "localhost";
    this.listenProtocol = options.listenProtocol || "tcp";
    this.process = null;
    this.binary = options.binary || path.join(this.wrongsvRepo, "target", "release", "wrongsv");
    this.logPath = path.join(this.outputDir, "wrongsv.log");
    this.runtimeConfigPath = path.join(this.outputDir, "wrongsv-runtime.toml");
  }

  async start() {
    const raw = fs.readFileSync(this.baseConfigPath, "utf8");
    const next = upsertWrongsvConfig(raw, {
      listenHost: this.listenHost,
      listenPort: this.listenPort,
      metricsPort: this.metricsPort,
      metricsBind: this.metricsBind,
    });
    fs.writeFileSync(this.runtimeConfigPath, next, "utf8");
    const out = fs.createWriteStream(this.logPath);
    this.process = spawn(this.binary, ["--config", this.runtimeConfigPath], {
      cwd: this.wrongsvRepo,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process.stdout.on("data", (chunk) => out.write(chunk));
    this.process.stderr.on("data", (chunk) => out.write(chunk));
    if (this.listenProtocol === "tcp") {
      await waitForPort(this.listenHost, readListenPort(next), 10000);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (this.metricsPort) {
      await waitForPort(this.metricsBind, this.metricsPort, 10000);
    }
  }

  generateClientConfig(format, options = {}) {
    return execFileSync(
      this.binary,
      [
        "--config",
        this.runtimeConfigPath,
        "--print-client-config",
        "--format",
        format,
        "--server-host",
        options.serverHost || this.serverHost,
        "--servername",
        options.serverName || this.serverName,
        "--client-name",
        options.clientName || "wrongsv-e2e",
      ],
      {
        cwd: this.wrongsvRepo,
        encoding: "utf8",
      }
    );
  }

  async stop() {
    if (!this.process) return;
    this.process.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.process.kill("SIGKILL");
        resolve();
      }, 5000);
      this.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.process = null;
  }
}

module.exports = {
  LocalTargetServer,
  WrongsvServer,
};
