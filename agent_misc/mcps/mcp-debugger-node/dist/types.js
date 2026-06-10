import { z } from "zod";
// --- Enums ---
export var SessionState;
(function (SessionState) {
    SessionState["CREATED"] = "CREATED";
    SessionState["RUNNING"] = "RUNNING";
    SessionState["PAUSED"] = "PAUSED";
    SessionState["TERMINATED"] = "TERMINATED";
    SessionState["ERROR"] = "ERROR";
})(SessionState || (SessionState = {}));
// --- Zod schemas ---
export const CreateDebugSessionSchema = z
    .object({
    nodeVersion: z
        .string()
        .optional()
        .describe("Node.js version to use via nvm (e.g. '22', '22.11.0', 'lts/iron', 'lts/*'). Uses current nvm default if omitted."),
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
//# sourceMappingURL=types.js.map