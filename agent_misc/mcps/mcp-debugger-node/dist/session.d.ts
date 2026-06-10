import { CdpClient } from "./cdp-client.js";
import { type DebugSession, type Breakpoint } from "./types.js";
export declare class SessionManager {
    private sessions;
    private clients;
    private processes;
    private breakpoints;
    createSession(nodeVersion?: string, name?: string): DebugSession;
    getSession(id: string): DebugSession | undefined;
    getClient(id: string): CdpClient;
    getAllSessions(): DebugSession[];
    getBreakpoints(id: string): Breakpoint[];
    private findFreePort;
    startDebugging(sessionId: string, scriptPath: string, options?: {
        args?: string[];
        stopOnEntry?: boolean;
        justMyCode?: boolean;
    }): Promise<void>;
    attachToProcess(sessionId: string, port: number): Promise<void>;
    detachFromProcess(sessionId: string): Promise<void>;
    setBreakpoint(sessionId: string, url: string, line: number, condition?: string): Promise<Breakpoint>;
    waitForPause(sessionId: string, timeoutMs?: number): Promise<void>;
    closeSession(sessionId: string): Promise<void>;
    closeAll(): Promise<void>;
}
