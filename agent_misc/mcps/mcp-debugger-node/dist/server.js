import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionManager } from "./session.js";
import { CreateDebugSessionSchema, StartDebuggingSchema, SetBreakpointSchema, SessionIdSchema, AttachToProcessSchema, GetVariablesSchema, GetLocalVariablesSchema, GetStackTraceSchema, GetScopesSchema, EvaluateExpressionSchema, GetSourceContextSchema, PauseExecutionSchema, } from "./types.js";
import { listNvmVersions, getCurrentNvmVersion } from "./nvm-resolver.js";
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const NoInputSchema = z.object({}).strict();
const sessionManager = new SessionManager();
const scopeObjectIds = new Map();
let nextScopeRef = 1;
function assignScopeRef(sessionId, objectId) {
    const key = `${sessionId}:${objectId}`;
    if (!scopeObjectIds.has(key)) {
        scopeObjectIds.set(key, nextScopeRef++);
    }
    return scopeObjectIds.get(key);
}
function getObjectIdByRef(sessionId, ref) {
    for (const [key, v] of scopeObjectIds) {
        if (v === ref && key.startsWith(`${sessionId}:`)) {
            return key.slice(sessionId.length + 1);
        }
    }
    return undefined;
}
function fmtFrame(f) {
    return f ? { name: f.name, file: f.file, line: f.line, column: f.column } : null;
}
function pauseInfo(sessionId, client) {
    const frames = client.getCachedFrames();
    return { sessionId, paused: frames.length > 0, topFrame: fmtFrame(frames[0]) };
}
function ok(data) {
    return { content: json(data) };
}
function json(data) {
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
}
function fail(ctx, err) {
    return {
        content: [{ type: "text", text: `Error ${ctx}: ${err instanceof Error ? err.message : String(err)}` }],
    };
}
const wf = (phase, order) => ({ workflow: { phase, order } });
// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
export function createServer() {
    const server = new McpServer({
        name: "mcp-debugger-node",
        title: "Node.js Step-Through Debugger (nvm)",
        version: "1.0.0",
        description: "Interactive Node.js/JavaScript debugging via the V8 inspector protocol (CDP). " +
            "Supports breakpoints, step-through execution, variable inspection, expression evaluation, " +
            "and nvm-based multi-version Node.js selection. Works with both launch and attach workflows.",
        websiteUrl: "https://github.com/irrit-us/agent_misc/tree/main/mcps/mcp-debugger-node",
    }, {
        capabilities: { logging: {} },
        instructions: "## Debug Workflow\n\n" +
            "### Launch Debugging\n" +
            "1. list_nvm_versions (optional — discover available Node.js versions)\n" +
            "2. create_debug_session (pick nodeVersion or omit for default)\n" +
            "3. start_debugging (scriptPath required; stopOnEntry defaults to true)\n" +
            "4. [paused] → inspect with get_stack_trace, get_scopes, get_local_variables\n" +
            "5. Set breakpoints with set_breakpoint if needed\n" +
            "6. Navigate: step_over, step_into, step_out, continue_execution, pause_execution\n" +
            "7. Evaluate expressions with evaluate_expression\n" +
            "8. close_debug_session when done\n\n" +
            "### Attach to Running Process\n" +
            "1. Start target process manually: node --inspect=9230 script.js\n" +
            "2. create_debug_session + attach_to_process(port: 9230)\n" +
            "3. pause_execution → inspect → detach_from_process or close_debug_session\n\n" +
            "### Key Rules\n" +
            "- Session ID is required for all operations after create_debug_session\n" +
            "- get_stack_trace, get_scopes, get_local_variables, evaluate_expression only work when paused\n" +
            "- Line numbers are 0-based (CDP convention): line 0 is the first line of the file\n" +
            "- File URLs must be absolute: file:///absolute/path/to/script.js\n" +
            "- Breakpoints use exact URL matching — use the same URL format that appears in stack traces",
    });
    // =========================================================================
    // SETUP phase — session creation & environment discovery
    // =========================================================================
    // --- create_debug_session ---
    server.registerTool("create_debug_session", {
        title: "Create Debug Session",
        description: "Create a new debug session for launching or attaching to a Node.js process. " +
            "Optionally select a specific Node.js version via nvm (e.g. '22', '22.11.0', 'lts/iron', 'lts/*'). " +
            "If nodeVersion is omitted the current nvm default is used.\n\n" +
            "This is the first step in every debug workflow — you MUST create a session before calling start_debugging or attach_to_process.\n\n" +
            "Workflow: [setup] → create_debug_session → start_debugging | attach_to_process → [execution] → [inspection] → close_debug_session\n\n" +
            "Returns: { sessionId, name, state, nodeVersion, createdAt }\n\n" +
            "Trigger: User wants to debug a Node.js script or inspect a running Node process.\n" +
            "Prerequisites: nvm installed (optional; falls back to system node).",
        inputSchema: CreateDebugSessionSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("setup", 1),
    }, async (params) => {
        try {
            const s = sessionManager.createSession(params.nodeVersion, params.name);
            return ok({ sessionId: s.id, name: s.name, state: s.state, nodeVersion: s.nodeVersion?.version || getCurrentNvmVersion(), createdAt: s.createdAt.toISOString() });
        }
        catch (err) {
            return fail("creating debug session", err);
        }
    });
    // --- list_nvm_versions ---
    server.registerTool("list_nvm_versions", {
        title: "List NVM Versions",
        description: "List all Node.js versions installed via nvm, including paths and which version is the current default. " +
            "Use this to discover available versions before calling create_debug_session with a specific nodeVersion.\n\n" +
            "Workflow: [setup] — discovery helper, call before create_debug_session if unsure about available versions.\n\n" +
            "Trigger: User asks what Node versions are available, or you need to pick a specific version for debugging.",
        inputSchema: NoInputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("setup", 0),
    }, async () => {
        try {
            return ok(listNvmVersions());
        }
        catch (err) {
            return fail("listing nvm versions", err);
        }
    });
    // --- list_supported_languages ---
    server.registerTool("list_supported_languages", {
        title: "List Supported Languages",
        description: "List the languages and runtimes this debugger supports (Node.js/JavaScript). " +
            "Returns available capabilities: launch, attach, breakpoints, step-through, variable-inspection, " +
            "expression-evaluation, and nvm multi-version support.\n\n" +
            "Trigger: Checking what debug features are available before starting a session.",
        inputSchema: NoInputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("setup", 0),
    }, async () => {
        return ok([{ language: "javascript", displayName: "Node.js / JavaScript", version: process.version, capabilities: ["launch", "attach", "breakpoints", "step-through", "variable-inspection", "expression-evaluation", "multi-version (nvm)"] }]);
    });
    // =========================================================================
    // EXECUTION phase — launch, attach, step, continue, pause
    // =========================================================================
    // --- start_debugging ---
    server.registerTool("start_debugging", {
        title: "Start Debugging",
        description: "Launch a Node.js script under the V8 inspector and attach the debugger.\n\n" +
            "Spawns the script at scriptPath using the Node.js version selected in create_debug_session. " +
            "By default pauses at the entry point (stopOnEntry: true). Use stopOnEntry: false to run until a breakpoint or completion.\n\n" +
            "Workflow: [setup] → create_debug_session → start_debugging → [execution + inspection]\n\n" +
            "Args:\n" +
            "  - sessionId: Session ID from create_debug_session\n" +
            "  - scriptPath: Absolute path to the Node.js script\n" +
            "  - args (string[], optional): CLI arguments passed to the script\n" +
            "  - stopOnEntry (boolean, default true): Pause immediately on script start\n" +
            "  - justMyCode (boolean, default true): Hide node_modules/internals from stack traces\n\n" +
            "Returns: { sessionId, state, scriptPath, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "After this call, use get_stack_trace to see where execution paused, then step or continue.",
        inputSchema: StartDebuggingSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("execution", 10),
    }, async (params) => {
        try {
            await sessionManager.startDebugging(params.sessionId, params.scriptPath, { args: params.args, stopOnEntry: params.stopOnEntry, justMyCode: params.justMyCode });
            const client = sessionManager.getClient(params.sessionId);
            const session = sessionManager.getSession(params.sessionId);
            return ok({ sessionId: params.sessionId, state: session?.state, scriptPath: params.scriptPath, paused: client.getCachedFrames().length > 0, topFrame: fmtFrame(client.getCachedFrames()[0]) });
        }
        catch (err) {
            return fail("starting debug session", err);
        }
    });
    // --- attach_to_process ---
    server.registerTool("attach_to_process", {
        title: "Attach to Process",
        description: "Attach the debugger to an already-running Node.js process via its V8 inspector port.\n\n" +
            "The target process must have been started with --inspect=<port> (or --inspect-brk). " +
            "Use this to debug a running server, long-lived process, or containerized app without restarting it.\n\n" +
            "Workflow: create_debug_session → attach_to_process → [inspection + execution]\n\n" +
            "Args:\n" +
            "  - sessionId: Session ID from create_debug_session\n" +
            "  - port: Debug port the target process is listening on (1024-65535)\n\n" +
            "Returns: { sessionId, state, attachedPort }\n\n" +
            "Trigger: Need to debug a process that is already running with --inspect.\n" +
            "Prerequisites: Target process must be running with --inspect=<port>. Session must be in CREATED state.",
        inputSchema: AttachToProcessSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        _meta: wf("execution", 11),
    }, async (params) => {
        try {
            await sessionManager.attachToProcess(params.sessionId, params.port);
            return ok({ sessionId: params.sessionId, state: sessionManager.getSession(params.sessionId)?.state, attachedPort: params.port });
        }
        catch (err) {
            return fail("attaching", err);
        }
    });
    // --- detach_from_process ---
    server.registerTool("detach_from_process", {
        title: "Detach from Process",
        description: "Detach the debugger from a running process without killing it. " +
            "The target process continues running independently. The session returns to CREATED state and can be reused.\n\n" +
            "Workflow: [attached] → detach_from_process → session reusable\n\n" +
            "Trigger: Finished live debugging and want the process to keep running without the debugger attached.",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        _meta: wf("execution", 19),
    }, async (params) => {
        try {
            await sessionManager.detachFromProcess(params.sessionId);
            return ok({ sessionId: params.sessionId, state: sessionManager.getSession(params.sessionId)?.state });
        }
        catch (err) {
            return fail("detaching", err);
        }
    });
    // --- set_breakpoint ---
    server.registerTool("set_breakpoint", {
        title: "Set Breakpoint",
        description: "Set a breakpoint at a specific file and line number. When execution reaches that location the debugger pauses.\n\n" +
            "Optionally provide a JavaScript condition expression — the breakpoint only triggers when it evaluates to truthy.\n\n" +
            "Workflow: can be called anytime after start_debugging/attach; effective on the next continue_execution.\n\n" +
            "Args:\n" +
            "  - sessionId: Session ID\n" +
            "  - url: File URL (e.g. 'file:///absolute/path/to/script.js') — must match the URL format in stack traces\n" +
            "  - line: 0-based line number (CDP convention: line 0 = first line of file)\n" +
            "  - condition (string, optional): JS expression evaluated at breakpoint scope; only pauses when truthy\n\n" +
            "Returns: { id, url, line, condition?, verified: boolean }\n\n" +
            "Trigger: Want execution to pause at a specific location or when a specific condition is met.\n" +
            "Note: verified=true means CDP accepted the location; it does not guarantee the line is reachable.",
        inputSchema: SetBreakpointSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("execution", 15),
    }, async (params) => {
        try {
            const bp = await sessionManager.setBreakpoint(params.sessionId, params.url, params.line, params.condition);
            return ok(bp);
        }
        catch (err) {
            return fail("setting breakpoint", err);
        }
    });
    // --- step_over ---
    server.registerTool("step_over", {
        title: "Step Over",
        description: "Execute the current line without stepping into any function calls on it. " +
            "If the line contains a function call the entire call runs to completion and the debugger pauses on the next statement.\n\n" +
            "Workflow: [paused] → step_over → [paused at next line]\n\n" +
            "Returns: { sessionId, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "Trigger: You want to skip over function internals and stay at the current call level.\n" +
            "Prerequisites: Execution must be paused (state PAUSED). Use pause_execution first if running.",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("execution", 20),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            await client.stepOver();
            await sessionManager.waitForPause(params.sessionId);
            return ok(pauseInfo(params.sessionId, client));
        }
        catch (err) {
            return fail("stepping over", err);
        }
    });
    // --- step_into ---
    server.registerTool("step_into", {
        title: "Step Into",
        description: "Step into the function being called on the current line. If the line has no function call behaves like step_over.\n\n" +
            "Workflow: [paused at call site] → step_into → [paused at first line of called function]\n\n" +
            "Returns: { sessionId, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "Trigger: You need to inspect the internals of a function being called on the current line.\n" +
            "Prerequisites: Execution must be paused (state PAUSED).",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("execution", 21),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            await client.stepInto();
            await sessionManager.waitForPause(params.sessionId);
            return ok(pauseInfo(params.sessionId, client));
        }
        catch (err) {
            return fail("stepping into", err);
        }
    });
    // --- step_out ---
    server.registerTool("step_out", {
        title: "Step Out",
        description: "Resume execution until the current function returns, then pause at the call site.\n\n" +
            "Workflow: [paused inside function] → step_out → [paused at caller after return]\n\n" +
            "Returns: { sessionId, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "Trigger: You're done inspecting the current function and want to return to the caller.\n" +
            "Prerequisites: Execution must be paused (state PAUSED).",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("execution", 22),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            await client.stepOut();
            await sessionManager.waitForPause(params.sessionId);
            return ok(pauseInfo(params.sessionId, client));
        }
        catch (err) {
            return fail("stepping out", err);
        }
    });
    // --- continue_execution ---
    server.registerTool("continue_execution", {
        title: "Continue Execution",
        description: "Resume script execution. The script runs until a breakpoint is hit, Debugger.pause is called, or the script completes.\n\n" +
            "Workflow: [paused] → continue_execution → [running (hit breakpoint) | terminated (script ended)]\n\n" +
            "Returns: { sessionId, state, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "Trigger: You've finished inspecting at the current pause location and want to proceed.\n" +
            "Note: If no breakpoints are set and stopOnEntry was false, the script may run to completion (state: TERMINATED).",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("execution", 25),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            await client.resume();
            await sessionManager.waitForPause(params.sessionId, 2000);
            return ok({ sessionId: params.sessionId, state: sessionManager.getSession(params.sessionId)?.state, paused: client.getCachedFrames().length > 0, topFrame: fmtFrame(client.getCachedFrames()[0]) });
        }
        catch (err) {
            return fail("continuing", err);
        }
    });
    // --- pause_execution ---
    server.registerTool("pause_execution", {
        title: "Pause Execution",
        description: "Interrupt a running script to inspect its state. Sends Debugger.pause via CDP to break into the debugger at the next opportunity.\n\n" +
            "Workflow: [running] → pause_execution → [paused] → [inspection tools]\n\n" +
            "Returns: { sessionId, paused, topFrame: {name, file, line, column} | null }\n\n" +
            "Trigger: Script is running and you need to inspect state, set breakpoints, or evaluate expressions.\n" +
            "After pause: Use get_stack_trace, get_local_variables, get_scopes, evaluate_expression to inspect state.",
        inputSchema: PauseExecutionSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("execution", 18),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            await client.pause();
            await sessionManager.waitForPause(params.sessionId);
            return ok(pauseInfo(params.sessionId, client));
        }
        catch (err) {
            return fail("pausing", err);
        }
    });
    // =========================================================================
    // INSPECTION phase — stack, scopes, variables, evaluate, source
    // =========================================================================
    // --- get_stack_trace ---
    server.registerTool("get_stack_trace", {
        title: "Get Stack Trace",
        description: "Return the current call stack while execution is paused. Frames are ordered innermost (index 0) to outermost. " +
            "Each frame includes the function name, source file URL, and 0-based line/column numbers.\n\n" +
            "Workflow: [paused] → get_stack_trace to locate execution point → set_breakpoint | step | evaluate\n\n" +
            "Args: sessionId, maxFrames (optional, default 50, max 100)\n\n" +
            "Returns: [{ id, name, file, line, column }]\n\n" +
            "Trigger: You need to see where execution is paused and what the call chain looks like.\n" +
            "Prerequisites: Execution must be paused.",
        inputSchema: GetStackTraceSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("inspection", 30),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            return ok(client.getCachedFrames().slice(0, params.maxFrames).map(f => ({ id: f.id, name: f.name, file: f.file, line: f.line, column: f.column })));
        }
        catch (err) {
            return fail("getting stack trace", err);
        }
    });
    // --- get_scopes ---
    server.registerTool("get_scopes", {
        title: "Get Scopes",
        description: "Return the scope chain for the current (topmost) stack frame. Scopes are ordered innermost to outermost. " +
            "Common types: 'local', 'closure', 'script', 'global', 'module', 'wasm-expression-stack'.\n\n" +
            "Workflow: [paused] → get_scopes → get_variables (on a scope's variablesReference)\n\n" +
            "Returns: [{ name, type, variablesReference }]\n\n" +
            "Each scope has a variablesReference — pass it to get_variables to enumerate the scope's contents.\n" +
            "Prerequisites: Execution must be paused.",
        inputSchema: GetScopesSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("inspection", 31),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            const frames = client.getCachedFrames();
            if (!frames.length)
                return ok({ error: "Not paused — no stack frames available" });
            return ok(frames[0].scopeChain.map(sc => ({ name: sc.name || sc.type, type: sc.type, variablesReference: assignScopeRef(params.sessionId, sc.objectId) })));
        }
        catch (err) {
            return fail("getting scopes", err);
        }
    });
    // --- get_variables ---
    server.registerTool("get_variables", {
        title: "Get Variables",
        description: "Enumerate the properties of a scope or object identified by a variablesReference. " +
            "Use this to drill into objects, arrays, closures, or scope contents.\n\n" +
            "Workflow: get_scopes | get_local_variables | evaluate_expression → [variablesReference] → get_variables\n\n" +
            "Returns: [{ name, value, type, variablesReference: number }]\n" +
            "If a returned variable has variablesReference > 0, call get_variables again with that reference to expand its properties.\n\n" +
            "Trigger: You have a variablesReference and want to see its contents.\n" +
            "Prerequisites: Must have a valid variablesReference from a previous inspection call.",
        inputSchema: GetVariablesSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("inspection", 33),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            const objectId = getObjectIdByRef(params.sessionId, params.variablesReference);
            if (!objectId)
                return ok({ error: `No object for variablesReference ${params.variablesReference}. The session may have resumed.` });
            const props = await client.getProperties(objectId);
            return ok(props.map(p => ({ name: p.name, value: p.value, type: p.type, variablesReference: p.objectId ? assignScopeRef(params.sessionId, p.objectId) : 0 })));
        }
        catch (err) {
            return fail("getting variables", err);
        }
    });
    // --- get_local_variables ---
    server.registerTool("get_local_variables", {
        title: "Get Local Variables",
        description: "Return all local variables in the topmost stack frame. Convenience wrapper that finds the local scope from the scope chain and enumerates it.\n\n" +
            "Workflow: [paused] → get_local_variables → get_variables (on nested objects)\n\n" +
            "Returns: [{ name, value, type, variablesReference }]\n\n" +
            "Trigger: Quick inspection — you want to see what local variables exist without manually navigating scopes.\n" +
            "Prerequisites: Execution must be paused.",
        inputSchema: GetLocalVariablesSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("inspection", 32),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            const frames = client.getCachedFrames();
            if (!frames.length)
                return ok({ error: "Not paused — no stack frames available" });
            const localScope = frames[0].scopeChain.find(s => s.type === "local");
            if (!localScope)
                return ok({ error: "No local scope found in current frame" });
            const props = await client.getProperties(localScope.objectId);
            return ok(props.map(p => ({ name: p.name, value: p.value, type: p.type, variablesReference: p.objectId ? assignScopeRef(params.sessionId, p.objectId) : 0 })));
        }
        catch (err) {
            return fail("getting local variables", err);
        }
    });
    // --- evaluate_expression ---
    server.registerTool("evaluate_expression", {
        title: "Evaluate Expression",
        description: "Evaluate a JavaScript expression in the context of the current paused stack frame. " +
            "Has full access to in-scope variables and can call functions, access object properties, etc.\n\n" +
            "Workflow: [paused] → evaluate_expression → { value, type, variablesReference }\n\n" +
            "Examples: 'myVariable', 'x + y', 'typeof obj', 'JSON.stringify(data)', 'arr.map(x => x * 2)', 'this.someMethod()'\n\n" +
            "Returns: { expression, value, type, variablesReference }\n" +
            "If the result is an object, variablesReference will be >0 — use get_variables to expand it.\n\n" +
            "Trigger: Inspecting complex values, testing expressions, calling helper functions.\n" +
            "Prerequisites: Execution must be paused for call-frame-scoped evaluation (no call frame = global eval).\n" +
            "Warning: Expressions with side effects (assignment, mutation) WILL modify program state.",
        inputSchema: EvaluateExpressionSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        _meta: wf("inspection", 35),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            const callFrameId = client.getCachedFrames()[0]?.callFrameId;
            const r = await client.evaluate(params.expression, callFrameId);
            return ok({ expression: params.expression, value: r.value, type: r.type, variablesReference: r.objectId ? assignScopeRef(params.sessionId, r.objectId) : 0 });
        }
        catch (err) {
            return fail("evaluating expression", err);
        }
    });
    // --- get_source_context ---
    server.registerTool("get_source_context", {
        title: "Get Source Context",
        description: "Retrieve source code around a specific line in a debugged script. " +
            "Useful for understanding code near a breakpoint or stack frame location.\n\n" +
            "Workflow: get_stack_trace → [note file + line] → get_source_context → read surrounding code\n\n" +
            "Args:\n" +
            "  - sessionId, url, line (0-based center line), contextLines (default 5, max 50)\n\n" +
            "Returns: { url, totalLines, context: [{ line, content, current: boolean }] }\n\n" +
            "Trigger: You need to see source code around a breakpoint or stack frame to make decisions.\n" +
            "Note: Only works for scripts that have been parsed by the debugger session.",
        inputSchema: GetSourceContextSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("inspection", 36),
    }, async (params) => {
        try {
            const client = sessionManager.getClient(params.sessionId);
            const source = await client.getSource(params.url);
            const lines = source.split("\n");
            const start = Math.max(0, params.line - params.contextLines);
            const end = Math.min(lines.length, params.line + params.contextLines + 1);
            const ctx = [];
            for (let i = start; i < end; i++)
                ctx.push({ line: i, content: lines[i], current: i === params.line });
            return ok({ url: params.url, totalLines: lines.length, context: ctx });
        }
        catch (err) {
            return fail("getting source", err);
        }
    });
    // =========================================================================
    // DISCOVERY phase — listing sessions and threads
    // =========================================================================
    // --- list_debug_sessions ---
    server.registerTool("list_debug_sessions", {
        title: "List Debug Sessions",
        description: "List all active debug sessions with state, Node version, script path, and breakpoint info. " +
            "Use this to find session IDs when you need to resume interacting with a previously created session.\n\n" +
            "Workflow: discovery — call anytime to see what sessions exist.\n\n" +
            "Returns: [{ sessionId, name, state, nodeVersion, scriptPath, createdAt, breakpoints }]\n\n" +
            "Trigger: You lost track of session IDs, or want to check what sessions are still active.",
        inputSchema: NoInputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        _meta: wf("discovery", 50),
    }, async () => {
        return ok(sessionManager.getAllSessions().map(s => ({ sessionId: s.id, name: s.name, state: s.state, nodeVersion: s.nodeVersion?.version || getCurrentNvmVersion(), scriptPath: s.scriptPath, createdAt: s.createdAt.toISOString(), breakpoints: sessionManager.getBreakpoints(s.id) })));
    });
    // --- list_threads ---
    server.registerTool("list_threads", {
        title: "List Threads",
        description: "List execution threads for a debug session. Node.js uses a single-threaded event loop, " +
            "so this always returns exactly one 'main' thread with the current session state.\n\n" +
            "Workflow: discovery — call after pause to verify thread state before inspection.\n\n" +
            "Returns: { sessionId, threads: [{ id, name, state }] }",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: wf("discovery", 51),
    }, async (params) => {
        return ok({ sessionId: params.sessionId, threads: [{ id: 0, name: "main", state: sessionManager.getSession(params.sessionId)?.state }] });
    });
    // =========================================================================
    // TEARDOWN phase — closing sessions
    // =========================================================================
    // --- close_debug_session ---
    server.registerTool("close_debug_session", {
        title: "Close Debug Session",
        description: "Terminate a debug session and the associated Node.js process. " +
            "Sends SIGTERM first; if the process doesn't exit within 3 seconds sends SIGKILL. " +
            "Cleans up all session resources: CDP connection, breakpoints, scope references, child process.\n\n" +
            "Workflow: [any state] → close_debug_session → [cleaned up]\n\n" +
            "Trigger: Debugging is complete, or you need to free resources.\n" +
            "Note: This is DESTRUCTIVE — the debugged process is killed. Use detach_from_process to disconnect without killing.",
        inputSchema: SessionIdSchema,
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        _meta: wf("teardown", 90),
    }, async (params) => {
        try {
            await sessionManager.closeSession(params.sessionId);
            return ok({ sessionId: params.sessionId, closed: true });
        }
        catch (err) {
            return fail("closing session", err);
        }
    });
    return server;
}
//# sourceMappingURL=server.js.map