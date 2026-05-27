# Agent Companion

A standalone, agent-agnostic dashboard for local AI agent telemetry and utilities.

The app uses MCP as the integration boundary:

- The dashboard backend is an MCP client.
- Each agent/runtime integration is an MCP server.
- Codex is the first adapter, exposed through `@agent-companion/mcp-codex`.

## Run

```bash
npm install
npm run dev
```

Dashboard: http://localhost:5173

API: http://localhost:4167

## Shape

```text
apps/dashboard       React dashboard
packages/server      Local API and MCP client host
packages/mcp-codex   MCP adapter for local Codex session telemetry
config               MCP server registry
docs                 Architecture notes and integration contract
```

## Why MCP

MCP gives this project a stable adapter layer. The dashboard does not need to know whether data comes from Codex, Claude Code, Cursor, a shell agent, or a future workflow runner. Each integration only needs to expose the same small telemetry contract over MCP.
