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

## Desktop App

```bash
npm run desktop:dev
npm run dist:win
npm run dist:linux
npm run dist:mac
```

The Windows portable executable is written to:

```text
release/Agent Companion 0.1.0.exe
```

Linux builds produce an AppImage. macOS builds produce a signed-app-ready `.app` inside a `.dmg` or `.zip` artifact. macOS applications are app bundles by platform convention, even when distributed as a single downloaded file.

## Shape

```text
apps/dashboard       React dashboard
apps/desktop         Electron desktop shell
packages/server      Local API and MCP client host
packages/mcp-codex   MCP adapter for local Codex session telemetry
config               MCP server registry
docs                 Architecture notes and integration contract
```

## Why MCP

MCP gives this project a stable adapter layer. The dashboard does not need to know whether data comes from Codex, Claude Code, Cursor, a shell agent, or a future workflow runner. Each integration only needs to expose the same small telemetry contract over MCP.

See [docs/data-flow.md](docs/data-flow.md) for how Agent Companion talks to Codex today.
