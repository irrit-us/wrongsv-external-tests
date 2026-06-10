import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { SessionState } from "./types.js";
export class CdpClient extends EventEmitter {
    ws = null;
    msgId = 0;
    pending = new Map();
    scripts = new Map(); // scriptId → url
    cachedFrames = [];
    state = SessionState.CREATED;
    getState() {
        return this.state;
    }
    setState(s) {
        this.state = s;
    }
    getCachedFrames() {
        return this.cachedFrames;
    }
    getScriptUrl(scriptId) {
        return this.scripts.get(scriptId);
    }
    async connect(port) {
        // Fetch the WebSocket URL from the /json endpoint
        const resp = await fetch(`http://127.0.0.1:${port}/json`);
        const targets = (await resp.json());
        const nodeTarget = targets.find((t) => t.type === "node");
        if (!nodeTarget) {
            throw new Error(`No Node.js debug target found on port ${port}`);
        }
        this.ws = new WebSocket(nodeTarget.webSocketDebuggerUrl);
        this.ws.on("message", (data) => this.handleMessage(data));
        await new Promise((resolve, reject) => {
            this.ws.once("open", resolve);
            this.ws.once("error", reject);
        });
        this.ws.on("error", (err) => this.emit("error", err));
        this.ws.on("close", () => {
            this.setState(SessionState.TERMINATED);
            this.emit("close");
        });
        // Enable debugger and runtime
        await this.send("Debugger.enable", {});
        await this.send("Runtime.enable", {});
        this.state = SessionState.RUNNING;
    }
    async send(method, params) {
        const id = ++this.msgId;
        const msg = { id, method, params };
        return new Promise((resolve, reject) => {
            this.pending.set(id, resolve);
            this.ws.send(JSON.stringify(msg), (err) => {
                if (err) {
                    this.pending.delete(id);
                    reject(err);
                }
            });
            // Timeout after 10s
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`CDP command ${method} timed out`));
                }
            }, 10000);
        });
    }
    handleMessage(data) {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined && this.pending.has(msg.id)) {
            const resolve = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) {
                // resolve with error info instead of throwing
                resolve({ error: msg.error.message });
            }
            else {
                resolve(msg.result);
            }
            return;
        }
        if (msg.method) {
            this.handleEvent(msg.method, msg.params || {});
        }
    }
    handleEvent(method, params) {
        switch (method) {
            case "Debugger.paused": {
                this.state = SessionState.PAUSED;
                const rawFrames = (params.callFrames || []);
                this.cachedFrames = rawFrames.map((f, i) => ({
                    id: i,
                    callFrameId: f.callFrameId,
                    name: f.functionName || "(anonymous)",
                    file: this.scripts.get(f.location.scriptId) || f.location.scriptId,
                    line: f.location.lineNumber,
                    column: f.location.columnNumber,
                    scopeChain: (f.scopeChain || []).map((sc) => ({
                        type: sc.type,
                        name: sc.name,
                        objectId: sc.object.objectId,
                    })),
                    thisObjectId: f.this?.objectId,
                }));
                this.emit("paused", params);
                break;
            }
            case "Debugger.resumed": {
                this.state = SessionState.RUNNING;
                this.cachedFrames = [];
                this.emit("resumed");
                break;
            }
            case "Debugger.scriptParsed": {
                const scriptId = params.scriptId;
                const url = params.url || scriptId;
                this.scripts.set(scriptId, url);
                this.emit("scriptParsed", { scriptId, url });
                break;
            }
            case "Runtime.consoleAPICalled": {
                this.emit("console", params);
                break;
            }
            case "Runtime.exceptionThrown": {
                this.emit("exception", params);
                break;
            }
        }
    }
    async pause() {
        await this.send("Debugger.pause");
    }
    async resume() {
        await this.send("Debugger.resume");
    }
    async stepOver() {
        await this.send("Debugger.stepOver");
    }
    async stepInto() {
        await this.send("Debugger.stepInto");
    }
    async stepOut() {
        await this.send("Debugger.stepOut");
    }
    async setBreakpoint(url, line, condition) {
        // CDP breakpoints use exact URL match, line is 0-based
        const result = (await this.send("Debugger.setBreakpointByUrl", {
            url,
            lineNumber: line,
            columnNumber: 0,
            condition: condition || undefined,
        }));
        return result;
    }
    async removeBreakpoint(breakpointId) {
        await this.send("Debugger.removeBreakpoint", { breakpointId });
    }
    async getProperties(objectId) {
        const result = (await this.send("Runtime.getProperties", {
            objectId,
            ownProperties: true,
            generatePreview: true,
        }));
        return (result.result || []).map((prop) => {
            const val = prop.value;
            const type = val?.type || "undefined";
            let displayValue = String(val?.value ?? val?.description ?? "undefined");
            const objectId = val?.objectId;
            return {
                name: prop.name,
                value: displayValue,
                type,
                objectId,
            };
        });
    }
    async evaluate(expression, callFrameId) {
        let result;
        if (callFrameId) {
            result = (await this.send("Debugger.evaluateOnCallFrame", {
                callFrameId,
                expression,
                returnByValue: false,
                generatePreview: true,
            }));
        }
        else {
            result = (await this.send("Runtime.evaluate", {
                expression,
                returnByValue: false,
                generatePreview: true,
            }));
        }
        if (result.exceptionDetails) {
            return {
                value: `Error: ${result.exceptionDetails.text}`,
                type: "error",
            };
        }
        const r = result.result;
        return {
            value: String(r?.value ?? r?.description ?? "undefined"),
            type: r?.type || "undefined",
            objectId: r?.objectId,
        };
    }
    async getSource(url) {
        // Try to get source via CDP for scripts we've seen
        // Find scriptId by URL
        for (const [sid, u] of this.scripts) {
            if (u === url) {
                const result = (await this.send("Debugger.getScriptSource", {
                    scriptId: sid,
                }));
                return result.scriptSource;
            }
        }
        throw new Error(`Source for ${url} not found in debugged scripts`);
    }
    async close() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                await this.send("Debugger.disable");
                await this.send("Runtime.disable");
            }
            catch {
                // ignore
            }
            this.ws.close();
        }
        this.setState(SessionState.TERMINATED);
    }
}
//# sourceMappingURL=cdp-client.js.map