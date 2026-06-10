import { EventEmitter } from "node:events";
import { SessionState, type StackFrame } from "./types.js";
export declare class CdpClient extends EventEmitter {
    private ws;
    private msgId;
    private pending;
    private scripts;
    private cachedFrames;
    private state;
    getState(): SessionState;
    setState(s: SessionState): void;
    getCachedFrames(): StackFrame[];
    getScriptUrl(scriptId: string): string | undefined;
    connect(port: number): Promise<void>;
    send(method: string, params?: Record<string, unknown>): Promise<unknown>;
    private handleMessage;
    private handleEvent;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stepOver(): Promise<void>;
    stepInto(): Promise<void>;
    stepOut(): Promise<void>;
    setBreakpoint(url: string, line: number, condition?: string): Promise<{
        breakpointId: string;
        locations: unknown[];
    }>;
    removeBreakpoint(breakpointId: string): Promise<void>;
    getProperties(objectId: string): Promise<Array<{
        name: string;
        value: string;
        type: string;
        objectId?: string;
    }>>;
    evaluate(expression: string, callFrameId?: string): Promise<{
        value: string;
        type: string;
        objectId?: string;
    }>;
    getSource(url: string): Promise<string>;
    close(): Promise<void>;
}
