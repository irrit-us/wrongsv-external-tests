import { z } from "zod";

// --- Enums ---

export enum SessionState {
  CREATED = "CREATED",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
  TERMINATED = "TERMINATED",
  ERROR = "ERROR",
}

// --- Zod schemas ---

export const CreateDebugSessionSchema = z
  .object({
    nodeVersion: z
      .string()
      .optional()
      .describe(
        "Node.js version to use via nvm (e.g. '22', '22.11.0', 'lts/iron', 'lts/*'). Uses current nvm default if omitted."
      ),
    name: z.string().optional().describe("Optional human-readable session name"),
  })
  .strict();

export const StartDebuggingSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID from create_debug_session"),
    scriptPath: z.string().min(1).describe("Absolute path to the Node.js script to debug"),
    args: z
      .array(z.string())
      .optional()
      .default([])
      .describe("Command-line arguments for the script"),
    stopOnEntry: z
      .boolean()
      .optional()
      .default(true)
      .describe("Pause immediately when the script starts"),
    justMyCode: z
      .boolean()
      .optional()
      .default(true)
      .describe("Skip node_modules and Node internals in stack traces"),
  })
  .strict();

export const SetBreakpointSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    url: z
      .string()
      .min(1)
      .describe("File URL or path to set breakpoint in (e.g. 'file:///path/to/script.js')"),
    line: z.number().int().min(0).describe("Line number (0-based)"),
    condition: z.string().optional().describe("Optional conditional expression"),
  })
  .strict();

export const SessionIdSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
  })
  .strict();

export const AttachToProcessSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    port: z
      .number()
      .int()
      .min(1024)
      .max(65535)
      .describe("Debug port of the running Node.js process"),
  })
  .strict();

export const GetVariablesSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    variablesReference: z
      .number()
      .int()
      .min(0)
      .describe("Variable reference ID from stack frame or scope"),
  })
  .strict();

export const GetLocalVariablesSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
  })
  .strict();

export const GetStackTraceSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    maxFrames: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("Maximum number of stack frames to return"),
  })
  .strict();

export const GetScopesSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
  })
  .strict();

export const EvaluateExpressionSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    expression: z
      .string()
      .min(1)
      .describe("JavaScript expression to evaluate in the paused context"),
  })
  .strict();

export const GetSourceContextSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
    url: z.string().min(1).describe("Source file URL"),
    line: z.number().int().min(0).describe("Center line number (0-based)"),
    contextLines: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(5)
      .describe("Lines to show before and after"),
  })
  .strict();

export const PauseExecutionSchema = z
  .object({
    sessionId: z.string().min(1).describe("Session ID"),
  })
  .strict();

// --- Derived types ---

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

// --- Domain types ---

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
