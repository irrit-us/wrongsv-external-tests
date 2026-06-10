import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { resolveNodeVersion } from "./nvm-resolver.js";
import { CdpClient } from "./cdp-client.js";
import { SessionState, type DebugSession, type Breakpoint, type NvmVersion } from "./types.js";

function waitForInspector(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/json`;

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            resolve();
            return;
          }
        }
      } catch {
        // not ready yet
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Inspector not ready on port ${port} within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 200);
    };
    void check();
  });
}

export class SessionManager {
  private sessions = new Map<string, DebugSession>();
  private clients = new Map<string, CdpClient>();
  private processes = new Map<string, ChildProcess>();
  private breakpoints = new Map<string, Breakpoint[]>();

  createSession(nodeVersion?: string, name?: string): DebugSession {
    const id = randomUUID();
    let resolvedVersion: NvmVersion | undefined;

    if (nodeVersion) {
      resolvedVersion = resolveNodeVersion(nodeVersion);
    }

    const session: DebugSession = {
      id,
      name: name || `session-${id.slice(0, 8)}`,
      state: SessionState.CREATED,
      nodeVersion: resolvedVersion,
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    this.clients.set(id, new CdpClient());
    this.breakpoints.set(id, []);

    return session;
  }

  getSession(id: string): DebugSession | undefined {
    return this.sessions.get(id);
  }

  getClient(id: string): CdpClient {
    const client = this.clients.get(id);
    if (!client) throw new Error(`No CDP client for session ${id}`);
    return client;
  }

  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values());
  }

  getBreakpoints(id: string): Breakpoint[] {
    return this.breakpoints.get(id) || [];
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        server.close(() => resolve(port));
      });
      server.on("error", reject);
    });
  }

  async startDebugging(
    sessionId: string,
    scriptPath: string,
    options?: {
      args?: string[];
      stopOnEntry?: boolean;
      justMyCode?: boolean;
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const client = this.getClient(sessionId);
    const port = await this.findFreePort();
    const nodeBin = session.nodeVersion?.resolvedPath || "node";

    // Spawn with --inspect (NOT --inspect-brk — Node 22 doesn't fire Debugger.paused with --inspect-brk)
    const childArgs = [
      `--inspect=127.0.0.1:${port}`,
      ...(options?.justMyCode !== false ? [] : []), // justMyCode is the default
      scriptPath,
      ...(options?.args || []),
    ];

    const child = spawn(nodeBin, childArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.on("exit", (code) => {
      session.state = SessionState.TERMINATED;
    });

    child.on("error", (err) => {
      session.state = SessionState.ERROR;
    });

    // Collect stdout/stderr for potential retrieval
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});

    this.processes.set(sessionId, child);

    // Wait for inspector to be ready, then connect
    await waitForInspector(port, 10000);
    await client.connect(port);

    session.state = SessionState.RUNNING;
    session.scriptPath = scriptPath;

    // Explicitly pause to get the initial paused state and call frames
    await client.pause();

    // Wait for the pause event
    await this.waitForPause(sessionId);

    if (!options?.stopOnEntry) {
      await client.resume();
    }
  }

  async attachToProcess(sessionId: string, port: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const client = this.getClient(sessionId);
    await client.connect(port);

    session.state = SessionState.RUNNING;
  }

  async detachFromProcess(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const client = this.getClient(sessionId);
    await client.close();

    session.state = SessionState.CREATED;
  }

  async setBreakpoint(
    sessionId: string,
    url: string,
    line: number,
    condition?: string
  ): Promise<Breakpoint> {
    const client = this.getClient(sessionId);
    const result = await client.setBreakpoint(url, line, condition);

    const bp: Breakpoint = {
      id: result.breakpointId,
      url,
      line,
      condition,
      verified: result.locations.length > 0,
    };

    const sessionBps = this.breakpoints.get(sessionId) || [];
    sessionBps.push(bp);
    this.breakpoints.set(sessionId, sessionBps);

    return bp;
  }

  async waitForPause(sessionId: string, timeoutMs = 5000): Promise<void> {
    const client = this.getClient(sessionId);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const frames = client.getCachedFrames();
      if (frames.length > 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    // Not paused after timeout — log and continue
  }

  async closeSession(sessionId: string): Promise<void> {
    const client = this.clients.get(sessionId);
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore
      }
      this.clients.delete(sessionId);
    }

    const child = this.processes.get(sessionId);
    if (child) {
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 3000);
      } catch {
        // ignore
      }
      this.processes.delete(sessionId);
    }

    this.sessions.delete(sessionId);
    this.breakpoints.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const id of this.sessions.keys()) {
      await this.closeSession(id);
    }
  }
}
