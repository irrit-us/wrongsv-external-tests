const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { ProxyAppManager } = require("../proxy-app-manager");

function firstExistingBinary(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    return candidate;
  }
  return null;
}

function waitForPort(host, port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };
    tryConnect();
  });
}

function resolveXrayBinary(repoRoot) {
  return firstExistingBinary([
    process.env.XRAY_BIN,
    path.join(repoRoot, "..", "test-deploy", "xray"),
    "xray",
  ]);
}

function resolveMihomoBinary(repoRoot) {
  return firstExistingBinary([
    process.env.MIHOMO_BIN,
    path.join(repoRoot, "..", "test-deploy", "mihomo"),
    "mihomo",
  ]);
}

function resolveV2RayBinary(repoRoot) {
  return firstExistingBinary([
    process.env.V2RAY_BIN,
    path.join(repoRoot, "..", "test-deploy", "v2ray"),
    "v2ray",
  ]);
}

function resolveSingBoxBinary(repoRoot) {
  return firstExistingBinary([
    process.env.SING_BOX_BIN,
    path.join(repoRoot, "..", "test-deploy", "sing-box"),
    "/usr/sbin/sing-box",
    "sing-box",
  ]);
}

class ProxyAppClientRunner {
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.app = options.app;
    this.configPath = options.configPath;
    this.runtimeRoot = options.runtimeRoot;
    this.timeout = options.timeout || 60000;
    this.clean = options.clean !== false;
    this.manager = null;
  }

  async start() {
    this.manager = new ProxyAppManager({
      app: this.app,
      config: this.configPath,
      headless: true,
      timeout: this.timeout,
      runtimeRoot: this.runtimeRoot,
    });
    const launch = await this.manager.launch();
    const connect = await this.manager.connectProxy();
    return {
      launch,
      connect,
      proxyUrl: this.getProxyUrl(),
    };
  }

  getProxyUrl() {
    if (!this.manager) {
      throw new Error(`${this.app} client has not been started`);
    }
    return this.manager.getProxyUrl();
  }

  async stop() {
    if (!this.manager) return;
    try {
      await this.manager.disconnectProxy();
    } catch (_) {}
    await this.manager.shutdown(this.clean && Boolean(this.runtimeRoot));
    this.manager = null;
  }
}

class CoreProcessRunner {
  constructor(options) {
    this.repoRoot = options.repoRoot;
    this.name = options.name;
    this.binary = options.binary;
    this.args = options.args;
    this.proxyPort = options.proxyPort;
    this.workDir = options.workDir || path.dirname(this.binary);
    this.logPath = options.logPath;
    this.process = null;
  }

  async start() {
    const out = fs.createWriteStream(this.logPath);
    this.process = spawn(this.binary, this.args, {
      cwd: this.workDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process.stdout.on("data", (chunk) => out.write(chunk));
    this.process.stderr.on("data", (chunk) => out.write(chunk));
    this.process.once("exit", (code) => {
      if (code !== 0 && fs.existsSync(this.logPath)) {
        const tail = fs.readFileSync(this.logPath, "utf8").split("\n").slice(-20).join("\n");
        out.write(`\n[${this.name}] exited with code ${code}\n${tail}\n`);
      }
    });
    await waitForPort("127.0.0.1", this.proxyPort, 30000);
    return {
      proxyUrl: this.getProxyUrl(),
    };
  }

  getProxyUrl() {
    return `socks5://127.0.0.1:${this.proxyPort}`;
  }

  async stop() {
    if (!this.process) return;
    this.process.kill("SIGTERM");
    await new Promise((resolve) => {
      const proc = this.process;
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.process = null;
  }
}

function createClientRunner(options) {
  switch (options.client) {
    case "flclash":
      return new ProxyAppClientRunner({
        repoRoot: options.repoRoot,
        app: "flclash",
        configPath: options.configPath,
        runtimeRoot: options.runtimeRoot,
      });
    case "hiddify":
      return new ProxyAppClientRunner({
        repoRoot: options.repoRoot,
        app: "hiddify",
        configPath: options.configPath,
      });
    case "clash-verge-rev":
      return new CoreProcessRunner({
        repoRoot: options.repoRoot,
        name: "clash-verge-rev",
        binary: resolveMihomoBinary(options.repoRoot),
        args: ["-d", options.outputDir, "-f", options.configPath],
        proxyPort: 7890,
        logPath: path.join(options.outputDir, "clash-verge-rev.log"),
      });
    case "xray-core":
      return new CoreProcessRunner({
        repoRoot: options.repoRoot,
        name: "xray-core",
        binary: resolveXrayBinary(options.repoRoot),
        args: ["run", "-config", options.configPath],
        proxyPort: 10808,
        logPath: path.join(options.outputDir, "xray-core.log"),
      });
    case "v2ray":
      return new CoreProcessRunner({
        repoRoot: options.repoRoot,
        name: "v2ray",
        binary: resolveV2RayBinary(options.repoRoot),
        args: ["run", "-config", options.configPath],
        proxyPort: 10818,
        logPath: path.join(options.outputDir, "v2ray.log"),
      });
    case "sing-box":
      return new CoreProcessRunner({
        repoRoot: options.repoRoot,
        name: "sing-box",
        binary: resolveSingBoxBinary(options.repoRoot),
        args: ["run", "-c", options.configPath],
        proxyPort: 10809,
        logPath: path.join(options.outputDir, "sing-box.log"),
      });
    default:
      throw new Error(`Unsupported client runner: ${options.client}`);
  }
}

module.exports = {
  createClientRunner,
  waitForPort,
};
