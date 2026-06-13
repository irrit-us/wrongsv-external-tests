const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function safeRead(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tailText(text, lines = 40) {
  return text.split("\n").slice(-lines).join("\n");
}

function summarizeOutbound(outbound) {
  if (!outbound || typeof outbound !== "object") return null;
  const streamSettings = outbound.streamSettings || outbound.stream_settings || {};
  return {
    tag: outbound.tag || "",
    protocol: outbound.protocol || outbound.type || "",
    network: streamSettings.network || outbound.network || "",
    security: streamSettings.security || "",
    transport: outbound.transport?.type || "",
  };
}

class CompositeDebugClient {
  constructor(options) {
    this.client = options.client;
    this.parts = options.parts || [];
  }

  async snapshot() {
    const results = await Promise.all(
      this.parts.map(async (part) => {
        try {
          return {
            type: part.constructor.name,
            data: await part.snapshot(),
          };
        } catch (error) {
          return {
            type: part.constructor.name,
            error: error.message,
          };
        }
      })
    );
    return {
      client: this.client,
      type: "composite",
      parts: results,
    };
  }

  async exerciseRuntimeTweaks() {
    const results = [];
    for (const part of this.parts) {
      if (typeof part.exerciseRuntimeTweaks !== "function") continue;
      try {
        results.push({
          type: part.constructor.name,
          data: await part.exerciseRuntimeTweaks(),
        });
      } catch (error) {
        results.push({
          type: part.constructor.name,
          error: error.message,
        });
      }
    }
    return {
      client: this.client,
      type: "composite",
      tweaks: results,
    };
  }
}

class ClashApiDebugClient {
  constructor(options) {
    this.baseUrl = options.baseUrl;
    this.secret = options.secret || "";
    this.logPath = options.logPath || "";
    this.client = options.client;
  }

  _headers(extra = {}) {
    const headers = { ...extra };
    if (this.secret) {
      headers.Authorization = `Bearer ${this.secret}`;
    }
    return headers;
  }

  async _request(pathname, init = {}) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: this._headers(init.headers),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${pathname} -> ${response.status} ${response.statusText}: ${text}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async snapshot() {
    const [version, configs, proxies, connections] = await Promise.all([
      this._request("/version"),
      this._request("/configs"),
      this._request("/proxies"),
      this._request("/connections"),
    ]);
    return {
      client: this.client,
      type: "clash-api",
      version,
      configs,
      proxies,
      connections,
      logTail: this.logTail(),
    };
  }

  async exerciseRuntimeTweaks() {
    const proxies = await this._request("/proxies");
    const selections = [];
    for (const [name, value] of Object.entries(proxies.proxies || {})) {
      if (!value || value.type !== "Selector") continue;
      const selected = value.now || value.all?.[0];
      if (!selected) continue;
      await this._request(`/proxies/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: selected }),
      });
      selections.push({ group: name, selected });
    }
    return { selections };
  }

  logTail(lines = 40) {
    return tailText(safeRead(this.logPath), lines);
  }
}

class VmBridgeDebugClient {
  constructor(options) {
    this.manager = options.manager;
    this.client = options.client;
  }

  async snapshot() {
    const [appState, selfTest, semantics, widgetTree] = await Promise.all([
      this.manager.callExtension("getAppState"),
      this.manager.runSelfTest(),
      this.manager.dumpSemantics(),
      this.manager.dumpWidgetTree(),
    ]);
    return {
      client: this.client,
      type: "vm-service",
      appState,
      selfTest,
      semantics,
      widgetTree,
    };
  }

  async exerciseRuntimeTweaks() {
    return {
      extensions: Array.from(this.manager.client.extensions.keys()),
    };
  }
}

class ProcessDebugClient {
  constructor(options) {
    this.client = options.client;
    this.logPath = options.logPath || "";
    this.configPath = options.configPath || "";
    this.binary = options.binary || "";
    this.proxyPort = options.proxyPort || null;
    this.args = options.args || [];
    this.pidProvider = options.pidProvider;
  }

  _pid() {
    try {
      return this.pidProvider?.() || null;
    } catch {
      return null;
    }
  }

  _readProcStatus(pid) {
    const statusPath = `/proc/${pid}/status`;
    if (!fs.existsSync(statusPath)) return null;
    const fields = {};
    for (const line of safeRead(statusPath).split("\n")) {
      const [key, ...rest] = line.split(":");
      if (!key || rest.length === 0) continue;
      fields[key.trim()] = rest.join(":").trim();
    }
    return fields;
  }

  _socketSnapshot(pid) {
    try {
      return execFileSync("ss", ["-ltnup"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\n")
        .filter((line) => line.includes(`pid=${pid}`))
        .slice(0, 40);
    } catch {
      return [];
    }
  }

  _configSummary() {
    const raw = safeRead(this.configPath);
    const parsed = safeJsonParse(raw);
    if (!parsed) {
      return {
        path: this.configPath,
        format: path.extname(this.configPath) || "unknown",
      };
    }
    const outbounds = Array.isArray(parsed.outbounds)
      ? parsed.outbounds.map(summarizeOutbound).filter(Boolean)
      : [];
    const inbounds = Array.isArray(parsed.inbounds)
      ? parsed.inbounds.map((inbound) => ({
          tag: inbound.tag || "",
          protocol: inbound.protocol || inbound.type || "",
          listen: inbound.listen || "",
          port: inbound.port || inbound.listen_port || null,
        }))
      : [];
    return {
      path: this.configPath,
      inbounds,
      outbounds,
    };
  }

  async snapshot() {
    const pid = this._pid();
    return {
      client: this.client,
      type: "process",
      pid,
      running: Boolean(pid),
      binary: this.binary,
      args: this.args,
      proxyPort: this.proxyPort,
      procStatus: pid ? this._readProcStatus(pid) : null,
      listeningSockets: pid ? this._socketSnapshot(pid) : [],
      configSummary: this._configSummary(),
      logTail: tailText(safeRead(this.logPath)),
    };
  }

  async exerciseRuntimeTweaks() {
    return {
      supported: false,
      reason: "client exposes no runtime control API; process-level debug only",
    };
  }
}

module.exports = {
  ClashApiDebugClient,
  CompositeDebugClient,
  ProcessDebugClient,
  VmBridgeDebugClient,
};
