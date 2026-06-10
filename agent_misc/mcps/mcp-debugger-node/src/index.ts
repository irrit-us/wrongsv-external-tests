#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));

  await server.connect(transport);
  await server.sendLoggingMessage({
    level: "info",
    data: "mcp-debugger-node: ready — 20 tools available for Node.js step-through debugging via V8 inspector protocol (CDP)",
  });
}

main().catch((error) => {
  console.error("mcp-debugger-node fatal:", error);
  process.exit(1);
});
