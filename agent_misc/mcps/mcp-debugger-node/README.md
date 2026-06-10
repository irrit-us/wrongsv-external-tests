# mcp-debugger-node

MCP server for interactive Node.js/JavaScript step-through debugging. Uses the V8 inspector protocol (CDP) directly over WebSocket — no DAP adapter, no multi-language wrappers. Supports nvm for per-session Node.js version selection.

## Requirements

- Node.js >= 18.0.0
- [nvm](https://github.com/nvm-sh/nvm) — optional; enables per-session Node.js version selection. Without nvm the system `node` on PATH is used.

## Installation

```bash
cd mcps/mcp-debugger-node
npm install
npm run build
```

## Claude Code Configuration

Add to your Claude Code MCP configuration (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "mcp-debugger-node": {
      "command": "node",
      "args": ["/absolute/path/to/agent_misc/mcps/mcp-debugger-node/dist/index.js"]
    }
  }
}
```

After restarting Claude Code, the 20 debugger tools will be available. Verify with: "list the tools available in mcp-debugger-node".

## Workflow

### Launch Debugging (most common)

```
create_debug_session → start_debugging → [paused]
  → get_stack_trace → get_local_variables → get_scopes
  → set_breakpoint → continue_execution → [hit breakpoint]
  → evaluate_expression → step_over/into/out
  → close_debug_session
```

1. **Setup**: Optionally call `list_nvm_versions` to check available Node versions, then `create_debug_session` with the desired `nodeVersion` (e.g. `"22"`, `"lts/iron"`, or omit for the nvm default).
2. **Launch**: `start_debugging` with the absolute `scriptPath`. With `stopOnEntry: true` (default) execution pauses immediately.
3. **Inspect**: `get_stack_trace` to see where you are, `get_local_variables` for local state, `get_scopes` to navigate the scope chain.
4. **Navigate**: `step_over` / `step_into` / `step_out` for line-by-line, `continue_execution` to run until the next breakpoint, `pause_execution` to interrupt a running script.
5. **Evaluate**: `evaluate_expression` runs arbitrary JavaScript in the paused frame's scope — inspect values, call methods, test conditions.
6. **Teardown**: `close_debug_session` kills the process and cleans up. Use `detach_from_process` instead to disconnect without killing.

### Attach to Running Process

```
[terminal] node --inspect=9230 server.js
create_debug_session → attach_to_process(port: 9230)
  → pause_execution → [inspect + navigate]
  → detach_from_process (or close_debug_session)
```

## Tool Reference

### Setup (3 tools)

| Tool | Description |
|------|-------------|
| `list_nvm_versions` | List nvm-installed Node.js versions with paths and default |
| `list_supported_languages` | List supported languages and debug capabilities |
| `create_debug_session` | Create session with optional nvm Node.js version |

### Execution (8 tools)

| Tool | Description |
|------|-------------|
| `start_debugging` | Launch script under V8 inspector; pause on entry |
| `attach_to_process` | Attach to running `--inspect` process |
| `detach_from_process` | Disconnect without killing process |
| `set_breakpoint` | Set breakpoint at file:line with optional condition |
| `step_over` | Execute current line; skip function internals |
| `step_into` | Enter function call on current line |
| `step_out` | Run until current function returns |
| `continue_execution` | Resume until breakpoint or completion |
| `pause_execution` | Interrupt running script for inspection |

### Inspection (6 tools)

| Tool | Description |
|------|-------------|
| `get_stack_trace` | Call stack with file/line/column per frame |
| `get_scopes` | Scope chain (local, closure, script, global) |
| `get_variables` | Enumerate object/scope properties by reference |
| `get_local_variables` | Local variables in current frame (convenience) |
| `evaluate_expression` | Evaluate JS in paused frame scope |
| `get_source_context` | Source code around a line |

### Discovery (2 tools)

| Tool | Description |
|------|-------------|
| `list_debug_sessions` | All active sessions with state and breakpoints |
| `list_threads` | Thread list (Node.js: single main thread) |

### Teardown (1 tool)

| Tool | Description |
|------|-------------|
| `close_debug_session` | Kill process, cleanup session (destructive) |

## Response Format

All tools return JSON with a consistent structure:

**Success**: `{ ...tool-specific fields... }` — direct JSON, no envelope. Errors are indicated by an `error` string field.

**Error**: `{ error: "description of what went wrong" }` — check the error message for guidance on how to fix.

**Pause results** (step_over, step_into, step_out, pause_execution, continue_execution, start_debugging):
```json
{
  "sessionId": "uuid",
  "paused": true,
  "topFrame": { "name": "functionName", "file": "file:///path/to/script.js", "line": 42, "column": 5 }
}
```

**Stack frames** (get_stack_trace):
```json
[
  { "id": 0, "name": "compute", "file": "file:///tmp/script.js", "line": 3, "column": 9 },
  { "id": 1, "name": "main", "file": "file:///tmp/script.js", "line": 10, "column": 1 }
]
```

**Variables** (get_variables, get_local_variables):
```json
[
  { "name": "sum", "value": "0", "type": "number", "variablesReference": 0 },
  { "name": "obj", "value": "Object", "type": "object", "variablesReference": 7 }
]
```
If `variablesReference > 0`, call `get_variables` with that reference to expand nested properties.

## Conventions

- **Line numbers are 0-based** (CDP standard). Line 0 is the first line of the file.
- **File URLs are absolute**: `file:///absolute/path/to/script.js`
- **Breakpoint URL matching is exact** — use the same URL format that appears in `get_stack_trace` responses.
- **All IDs are UUIDs** (session IDs, breakpoint IDs are CDP-generated strings).

## Architecture

```
mcp-debugger-node/
├── src/
│   ├── index.ts          # Stdio entry point, server metadata
│   ├── server.ts         # 20 MCP tools with workflow phases
│   ├── session.ts        # Session lifecycle, process spawn/attach
│   ├── cdp-client.ts     # V8 inspector CDP WebSocket client
│   ├── nvm-resolver.ts   # nvm version path resolution
│   └── types.ts          # Zod schemas (.strict()), domain types
└── dist/                 # Compiled JavaScript
```

**Protocol stack**: MCP (stdio) → CDP (WebSocket) → V8 Inspector → Node.js process

**Dependencies**: `@modelcontextprotocol/sdk` ^1.6.0, `ws` ^8.18.0, `zod` ^3.25.0

## License

MIT — adapted from [debugmcp/mcp-debugger](https://github.com/debugmcp/mcp-debugger)
