#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getCodexUsageSnapshots } from "./codexUsage.js";

const server = new McpServer({
  name: "agent-companion-mcp-codex",
  version: "0.1.0"
});

server.registerTool(
  "get_usage_snapshot",
  {
    title: "Get Codex usage snapshot",
    description: "Return the latest local Codex token and context usage snapshot.",
    inputSchema: {}
  },
  async () => {
    const result = { snapshots: await getCodexUsageSnapshots(16) };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }
);

server.registerResource(
  "codex-usage-current",
  "agent://codex-local/usage/current",
  {
    title: "Codex usage snapshot",
    description: "Latest local Codex token and context usage snapshot.",
    mimeType: "application/json"
  },
  async (uri) => {
    const result = { snapshots: await getCodexUsageSnapshots(16) };
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

await server.connect(new StdioServerTransport());
