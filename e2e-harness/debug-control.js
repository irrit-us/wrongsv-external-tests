const fs = require("fs");

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
    if (!this.logPath || !fs.existsSync(this.logPath)) return "";
    return fs.readFileSync(this.logPath, "utf8").split("\n").slice(-lines).join("\n");
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

module.exports = {
  ClashApiDebugClient,
  VmBridgeDebugClient,
};
