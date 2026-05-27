# Architecture

Agent Companion is intentionally agent-agnostic.

## Components

- `apps/dashboard`: UI for at-a-glance status, usage, and tools.
- `packages/server`: local HTTP API. It is the only part of the dashboard that talks to MCP servers.
- `packages/mcp-codex`: MCP server that adapts local Codex session logs into a common telemetry shape.

## MCP Role

The dashboard backend is an MCP client. It launches configured MCP servers from `config/mcp-servers.json`, calls telemetry tools, and normalizes responses for the UI.

Each agent adapter should expose:

- Tool: `get_usage_snapshot`
- Optional resource: `agent://<agent-id>/usage/current`

This keeps the dashboard independent from any one agent's local storage format.

## Token Usage Semantics

For Codex, `currentContextTokens` is derived from the latest `token_count` event's `last_token_usage.input_tokens`. `maxContextTokens` is derived from `model_context_window`. `totalTokensUsed` is cumulative usage for the session as reported by Codex.

Other agents can map their own data into the same fields.
