import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolveNodeVersion } from "./nvm-resolver.js";
import { CdpClient } from "./cdp-client.js";
import { SessionState } from "./types.js";
function waitForInspector(port, timeoutMs) {
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
            }
            catch {
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
    sessions = new Map();
    clients = new Map();
    processes = new Map();
    breakpoints = new Map();
    createSession(nodeVersion, name) {
        const id = randomUUID();
        let resolvedVersion;
        if (nodeVersion) {
            resolvedVersion = resolveNodeVersion(nodeVersion);
        }
        const session = {
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
    getSession(id) {
        return this.sessions.get(id);
    }
    getClient(id) {
        const client = this.clients.get(id);
        if (!client)
            throw new Error(`No CDP client for session ${id}`);
        return client;
    }
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
    getBreakpoints(id) {
        return this.breakpoints.get(id) || [];
    }
    async findFreePort() {
        return new Promise((resolve, reject) => {
            const server = createServer();
            server.listen(0, "127.0.0.1", () => {
                const port = server.address().port;
                server.close(() => resolve(port));
            });
            server.on("error", reject);
        });
    }
    async startDebugging(sessionId, scriptPath, options) {
        const session = this.sessions.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
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
        child.stdout?.on("data", () => { });
        child.stderr?.on("data", () => { });
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
    async attachToProcess(sessionId, port) {
        const session = this.sessions.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
        const client = this.getClient(sessionId);
        await client.connect(port);
        session.state = SessionState.RUNNING;
    }
    async detachFromProcess(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
        const client = this.getClient(sessionId);
        await client.close();
        session.state = SessionState.CREATED;
    }
    async setBreakpoint(sessionId, url, line, condition) {
        const client = this.getClient(sessionId);
        const result = await client.setBreakpoint(url, line, condition);
        const bp = {
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
    async waitForPause(sessionId, timeoutMs = 5000) {
        const client = this.getClient(sessionId);
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const frames = client.getCachedFrames();
            if (frames.length > 0)
                return;
            await new Promise((r) => setTimeout(r, 100));
        }
        // Not paused after timeout — log and continue
    }
    async closeSession(sessionId) {
        const client = this.clients.get(sessionId);
        if (client) {
            try {
                await client.close();
            }
            catch {
                // ignore
            }
            this.clients.delete(sessionId);
        }
        const child = this.processes.get(sessionId);
        if (child) {
            try {
                child.kill("SIGTERM");
                setTimeout(() => {
                    if (!child.killed)
                        child.kill("SIGKILL");
                }, 3000);
            }
            catch {
                // ignore
            }
            this.processes.delete(sessionId);
        }
        this.sessions.delete(sessionId);
        this.breakpoints.delete(sessionId);
    }
    async closeAll() {
        for (const id of this.sessions.keys()) {
            await this.closeSession(id);
        }
    }
}
//# sourceMappingURL=session.js.map