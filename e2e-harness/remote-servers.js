const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync, spawn } = require("child_process");
const { waitForPort } = require("./client-runners");

const SSH_OPTIONS = ["-o", "StrictHostKeyChecking=accept-new"];

function sshExec(host, command, options = {}) {
  return execFileSync("ssh", [...SSH_OPTIONS, host, command], {
    encoding: "utf8",
    ...options,
  });
}

function remoteFileSize(host, remotePath) {
  const output = sshExec(
    host,
    `if [ -f ${shellQuote(remotePath)} ]; then stat -c %s ${shellQuote(remotePath)}; fi`
  ).trim();
  return output ? Number(output) : null;
}

function scpTo(host, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const localSize = fs.statSync(localPath).size;
    if (remoteFileSize(host, remotePath) === localSize) {
      resolve();
      return;
    }
    const process = spawn(
      "ssh",
      [...SSH_OPTIONS, host, `mkdir -p ${shellQuote(path.dirname(remotePath))} && gzip -dc > ${shellQuote(remotePath)}`],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    fs.createReadStream(localPath).pipe(zlib.createGzip({ level: 6 })).pipe(process.stdin);
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ssh upload failed for ${remotePath}: ${stderr.trim()}`));
    });
  });
}

function scpFrom(host, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    const process = spawn("ssh", [...SSH_OPTIONS, host, `cat ${shellQuote(remotePath)}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let stderr = "";
    process.stdout.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        fs.writeFileSync(localPath, Buffer.concat(chunks));
        resolve();
        return;
      }
      reject(new Error(`ssh download failed for ${remotePath}: ${stderr.trim()}`));
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

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

function resolveServerHost(hostAlias) {
  const output = execFileSync("ssh", ["-G", hostAlias], { encoding: "utf8" });
  const line = output
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("hostname "));
  return line ? line.slice("hostname ".length).trim() : hostAlias;
}

function killRemotePortListeners(host, port) {
  sshExec(
    host,
    `python3 - <<'PY'\nimport os, re, signal, subprocess, time\nport = ${Number(port)}\ndef pids_for_port():\n    out = subprocess.run(['ss', '-ltnp'], capture_output=True, text=True, check=False).stdout\n    return sorted({int(pid) for line in out.splitlines() if f':{port}' in line for pid in re.findall(r'pid=([0-9]+)', line)})\nfor sig in (signal.SIGTERM, signal.SIGKILL):\n    pids = pids_for_port()\n    if not pids:\n        break\n    for pid in pids:\n        try:\n            os.kill(pid, sig)\n        except ProcessLookupError:\n            pass\n    time.sleep(0.5)\nPY`
  );
}

function spawnSshProcess(host, command, logPath) {
  const out = fs.createWriteStream(logPath, { flags: "a" });
  const process = spawn("ssh", [...SSH_OPTIONS, host, command], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.on("data", (chunk) => out.write(chunk));
  process.stderr.on("data", (chunk) => out.write(chunk));
  return process;
}

async function stopSpawnedProcess(process) {
  if (!process) return;
  process.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      process.kill("SIGKILL");
      resolve();
    }, 5000);
    process.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

class SshTunnel {
  constructor(options) {
    this.host = options.host;
    this.localPort = options.localPort;
    this.remotePort = options.remotePort;
    this.logPath = options.logPath;
    this.process = null;
  }

  async start() {
    const out = fs.createWriteStream(this.logPath);
    this.process = spawn(
      "ssh",
      [
        ...SSH_OPTIONS,
        "-N",
        "-L",
        `${this.localPort}:127.0.0.1:${this.remotePort}`,
        this.host,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    this.process.stdout.on("data", (chunk) => out.write(chunk));
    this.process.stderr.on("data", (chunk) => out.write(chunk));
    await waitForPort("127.0.0.1", this.localPort, 10000);
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

class RemoteTargetServer {
  constructor(options) {
    this.host = options.host;
    this.remoteDir = options.remoteDir;
    this.scriptPath = options.scriptPath;
    this.port = options.port || 3300;
    this.outputDir = options.outputDir;
    this.logPath = path.join(this.outputDir, "remote-target-server.log");
    this.process = null;
  }

  async start() {
    sshExec(this.host, `mkdir -p ${shellQuote(this.remoteDir)}`);
    killRemotePortListeners(this.host, this.port);
    const remoteScriptPath = `${this.remoteDir}/local-test-server.js`;
    await scpTo(this.host, this.scriptPath, remoteScriptPath);
    this.process = spawnSshProcess(
      this.host,
      `cd ${shellQuote(this.remoteDir)} && exec node ${shellQuote(remoteScriptPath)} --port ${this.port}`,
      this.logPath
    );
    await this._waitForRemotePort();
  }

  async stop() {
    await stopSpawnedProcess(this.process);
    this.process = null;
    killRemotePortListeners(this.host, this.port);
  }

  async _waitForRemotePort() {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        sshExec(
          this.host,
          `python3 -c ${shellQuote(`import socket; s=socket.socket(); s.settimeout(1); s.connect(("127.0.0.1", ${this.port})); print("ok")`)}`
        );
        return;
      } catch (_) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`Timed out waiting for remote target server on ${this.host}:${this.port}`);
  }
}

class RemoteWrongsvServer {
  constructor(options) {
    this.host = options.host;
    this.serverHost = options.serverHost || resolveServerHost(options.host);
    this.remoteDir = options.remoteDir;
    this.localBinary = options.localBinary;
    this.baseConfigPath = options.baseConfigPath;
    this.outputDir = options.outputDir;
    this.listenHost = options.listenHost || "0.0.0.0";
    this.listenPort = options.listenPort || 50443;
    this.metricsPort = options.metricsPort || 59100;
    this.metricsBind = options.metricsBind || "127.0.0.1";
    this.serverName = options.serverName || "localhost";
    this.remoteBinaryPath = `${this.remoteDir}/wrongsv`;
    this.remoteConfigPath = `${this.remoteDir}/wrongsv-runtime.toml`;
    this.runtimeConfigPath = path.join(this.outputDir, "wrongsv-runtime.toml");
    this.logPath = path.join(this.outputDir, "wrongsv.log");
    this.process = null;
  }

  async start() {
    sshExec(this.host, `mkdir -p ${shellQuote(this.remoteDir)}`);
    killRemotePortListeners(this.host, this.listenPort);
    if (this.metricsPort) {
      killRemotePortListeners(this.host, this.metricsPort);
    }
    const raw = fs.readFileSync(this.baseConfigPath, "utf8");
    const next = upsertWrongsvConfig(raw, {
      listenHost: this.listenHost,
      listenPort: this.listenPort,
      metricsPort: this.metricsPort,
      metricsBind: this.metricsBind,
    });
    fs.writeFileSync(this.runtimeConfigPath, next, "utf8");

    await scpTo(this.host, this.localBinary, this.remoteBinaryPath);
    await scpTo(this.host, this.runtimeConfigPath, this.remoteConfigPath);
    sshExec(this.host, `chmod +x ${shellQuote(this.remoteBinaryPath)}`);
    this.process = spawnSshProcess(
      this.host,
      `cd ${shellQuote(this.remoteDir)} && exec ${shellQuote(this.remoteBinaryPath)} --config ${shellQuote(this.remoteConfigPath)}`,
      this.logPath
    );

    await waitForPort(this.serverHost, readListenPort(next), 10000);
  }

  generateClientConfig(format, options = {}) {
    return execFileSync(
      this.localBinary,
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
        options.clientName || "wrongsv-remote-e2e",
      ],
      {
        cwd: path.dirname(this.localBinary),
        encoding: "utf8",
      }
    );
  }

  async stop() {
    await stopSpawnedProcess(this.process);
    this.process = null;
    killRemotePortListeners(this.host, this.listenPort);
    if (this.metricsPort) {
      killRemotePortListeners(this.host, this.metricsPort);
    }
  }
}

module.exports = {
  RemoteTargetServer,
  RemoteWrongsvServer,
  SshTunnel,
  resolveServerHost,
  upsertWrongsvConfig,
};
