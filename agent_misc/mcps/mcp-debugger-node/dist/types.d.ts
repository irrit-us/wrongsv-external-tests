import { z } from "zod";
export declare enum SessionState {
    CREATED = "CREATED",
    RUNNING = "RUNNING",
    PAUSED = "PAUSED",
    TERMINATED = "TERMINATED",
    ERROR = "ERROR"
}
export declare const CreateDebugSessionSchema: z.ZodObject<{
    nodeVersion: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    nodeVersion?: string | undefined;
    name?: string | undefined;
}, {
    nodeVersion?: string | undefined;
    name?: string | undefined;
}>;
export declare const StartDebuggingSchema: z.ZodObject<{
    sessionId: z.ZodString;
    scriptPath: z.ZodString;
    args: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    stopOnEntry: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    justMyCode: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    scriptPath: string;
    args: string[];
    stopOnEntry: boolean;
    justMyCode: boolean;
}, {
    sessionId: string;
    scriptPath: string;
    args?: string[] | undefined;
    stopOnEntry?: boolean | undefined;
    justMyCode?: boolean | undefined;
}>;
export declare const SetBreakpointSchema: z.ZodObject<{
    sessionId: z.ZodString;
    url: z.ZodString;
    line: z.ZodNumber;
    condition: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    url: string;
    line: number;
    condition?: string | undefined;
}, {
    sessionId: string;
    url: string;
    line: number;
    condition?: string | undefined;
}>;
export declare const SessionIdSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export declare const AttachToProcessSchema: z.ZodObject<{
    sessionId: z.ZodString;
    port: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    port: number;
}, {
    sessionId: string;
    port: number;
}>;
export declare const GetVariablesSchema: z.ZodObject<{
    sessionId: z.ZodString;
    variablesReference: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    variablesReference: number;
}, {
    sessionId: string;
    variablesReference: number;
}>;
export declare const GetLocalVariablesSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export declare const GetStackTraceSchema: z.ZodObject<{
    sessionId: z.ZodString;
    maxFrames: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    maxFrames: number;
}, {
    sessionId: string;
    maxFrames?: number | undefined;
}>;
export declare const GetScopesSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export declare const EvaluateExpressionSchema: z.ZodObject<{
    sessionId: z.ZodString;
    expression: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    expression: string;
}, {
    sessionId: string;
    expression: string;
}>;
export declare const GetSourceContextSchema: z.ZodObject<{
    sessionId: z.ZodString;
    url: z.ZodString;
    line: z.ZodNumber;
    contextLines: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
    url: string;
    line: number;
    contextLines: number;
}, {
    sessionId: string;
    url: string;
    line: number;
    contextLines?: number | undefined;
}>;
export declare const PauseExecutionSchema: z.ZodObject<{
    sessionId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    sessionId: string;
}, {
    sessionId: string;
}>;
export type CreateDebugSessionInput = z.infer<typeof CreateDebugSessionSchema>;
export type StartDebuggingInput = z.infer<typeof StartDebuggingSchema>;
export type SetBreakpointInput = z.infer<typeof SetBreakpointSchema>;
export type AttachToProcessInput = z.infer<typeof AttachToProcessSchema>;
export type GetVariablesInput = z.infer<typeof GetVariablesSchema>;
export type GetLocalVariablesInput = z.infer<typeof GetLocalVariablesSchema>;
export type GetStackTraceInput = z.infer<typeof GetStackTraceSchema>;
export type GetScopesInput = z.infer<typeof GetScopesSchema>;
export type EvaluateExpressionInput = z.infer<typeof EvaluateExpressionSchema>;
export type GetSourceContextInput = z.infer<typeof GetSourceContextSchema>;
export type PauseExecutionInput = z.infer<typeof PauseExecutionSchema>;
export interface NvmVersion {
    raw: string;
    resolvedPath: string;
    version: string;
}
export interface StackFrame {
    id: number;
    callFrameId: string;
    name: string;
    file: string;
    line: number;
    column: number;
    scopeChain: Scope[];
    thisObjectId?: string;
}
export interface Scope {
    type: string;
    name: string;
    objectId: string;
}
export interface Variable {
    name: string;
    value: string;
    type: string;
    variablesReference: number;
}
export interface Breakpoint {
    id: string;
    url: string;
    line: number;
    condition?: string;
    verified: boolean;
}
export interface DebugSession {
    id: string;
    name: string;
    state: SessionState;
    nodeVersion?: NvmVersion;
    scriptPath?: string;
    createdAt: Date;
}
export interface LanguageInfo {
    language: string;
    displayName: string;
    version: string;
    capabilities: string[];
}
