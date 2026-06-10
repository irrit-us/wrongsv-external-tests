import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { SessionState, type Scope, type StackFrame } from "./types.js";

interface CdpMessage {
  id: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface ScriptInfo {
  scriptId: string;
  url: string;
}

interface PausedFrame {
  callFrameId: string;
  functionName: string;
  location: { scriptId: string; lineNumber: number; columnNumber: number };
  scopeChain: Array<{
    type: string;
    name: string;
    object: { objectId: string; className: string };
  }>;
  this: { objectId?: string };
}

export class CdpClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, (result: unknown) => void>();
  private scripts = new Map<string, string>(); // scriptId → url
  private cachedFrames: StackFrame[] = [];
  private state: SessionState = SessionState.CREATED;

  getState(): SessionState {
    return this.state;
  }

  setState(s: SessionState): void {
    this.state = s;
  }

  getCachedFrames(): StackFrame[] {
    return this.cachedFrames;
  }

  getScriptUrl(scriptId: string): string | undefined {
    return this.scripts.get(scriptId);
  }

  async connect(port: number): Promise<void> {
    // Fetch the WebSocket URL from the /json endpoint
    const resp = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = (await resp.json()) as Array<{
      webSocketDebuggerUrl: string;
      type: string;
    }>;
    const nodeTarget = targets.find((t) => t.type === "node");
    if (!nodeTarget) {
      throw new Error(`No Node.js debug target found on port ${port}`);
    }

    this.ws = new WebSocket(nodeTarget.webSocketDebuggerUrl);
    this.ws.on("message", (data) => this.handleMessage(data));

    await new Promise<void>((resolve, reject) => {
      this.ws!.once("open", resolve);
      this.ws!.once("error", reject);
    });

    this.ws!.on("error", (err) => this.emit("error", err));
    this.ws!.on("close", () => {
      this.setState(SessionState.TERMINATED);
      this.emit("close");
    });

    // Enable debugger and runtime
    await this.send("Debugger.enable", {});
    await this.send("Runtime.enable", {});
    this.state = SessionState.RUNNING;
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.msgId;
    const msg: CdpMessage = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.ws!.send(JSON.stringify(msg), (err) => {
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

  private handleMessage(data: WebSocket.Data): void {
    const msg: CdpMessage = JSON.parse(data.toString());

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const resolve = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) {
        // resolve with error info instead of throwing
        resolve({ error: msg.error.message });
      } else {
        resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      this.handleEvent(msg.method, msg.params || {});
    }
  }

  private handleEvent(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case "Debugger.paused": {
        this.state = SessionState.PAUSED;
        const rawFrames = (params.callFrames || []) as PausedFrame[];
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
        const scriptId = params.scriptId as string;
        const url = (params.url as string) || scriptId;
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

  async pause(): Promise<void> {
    await this.send("Debugger.pause");
  }

  async resume(): Promise<void> {
    await this.send("Debugger.resume");
  }

  async stepOver(): Promise<void> {
    await this.send("Debugger.stepOver");
  }

  async stepInto(): Promise<void> {
    await this.send("Debugger.stepInto");
  }

  async stepOut(): Promise<void> {
    await this.send("Debugger.stepOut");
  }

  async setBreakpoint(
    url: string,
    line: number,
    condition?: string
  ): Promise<{ breakpointId: string; locations: unknown[] }> {
    // CDP breakpoints use exact URL match, line is 0-based
    const result = (await this.send("Debugger.setBreakpointByUrl", {
      url,
      lineNumber: line,
      columnNumber: 0,
      condition: condition || undefined,
    })) as { breakpointId: string; locations: unknown[] };
    return result;
  }

  async removeBreakpoint(breakpointId: string): Promise<void> {
    await this.send("Debugger.removeBreakpoint", { breakpointId });
  }

  async getProperties(
    objectId: string
  ): Promise<Array<{ name: string; value: string; type: string; objectId?: string }>> {
    const result = (await this.send("Runtime.getProperties", {
      objectId,
      ownProperties: true,
      generatePreview: true,
    })) as {
      result?: Array<{
        name: string;
        value?: { type: string; value?: unknown; description?: string; objectId?: string };
      }>;
    };

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

  async evaluate(
    expression: string,
    callFrameId?: string
  ): Promise<{ value: string; type: string; objectId?: string }> {
    let result: { result?: { type: string; value?: unknown; description?: string; objectId?: string }; exceptionDetails?: { text: string } };

    if (callFrameId) {
      result = (await this.send("Debugger.evaluateOnCallFrame", {
        callFrameId,
        expression,
        returnByValue: false,
        generatePreview: true,
      })) as typeof result;
    } else {
      result = (await this.send("Runtime.evaluate", {
        expression,
        returnByValue: false,
        generatePreview: true,
      })) as typeof result;
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

  async getSource(url: string): Promise<string> {
    // Try to get source via CDP for scripts we've seen
    // Find scriptId by URL
    for (const [sid, u] of this.scripts) {
      if (u === url) {
        const result = (await this.send("Debugger.getScriptSource", {
          scriptId: sid,
        })) as { scriptSource: string };
        return result.scriptSource;
      }
    }
    throw new Error(`Source for ${url} not found in debugged scripts`);
  }

  async close(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        await this.send("Debugger.disable");
        await this.send("Runtime.disable");
      } catch {
        // ignore
      }
      this.ws.close();
    }
    this.setState(SessionState.TERMINATED);
  }
}
