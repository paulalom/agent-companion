# Data Flow

Agent Companion is a pull-based dashboard today.

## Current Codex Integration

Codex writes session events to local JSONL files under:

```text
~/.codex/sessions
```

Those files include `token_count` events with token usage and model context window information. The Codex adapter in `packages/mcp-codex` reads the newest relevant session events and exposes them through MCP as:

```text
get_usage_snapshot
```

The tool may return a single `AgentUsageSnapshot` or `{ "snapshots": [...] }`. The local API flattens
those results across adapters so one integration can report multiple active or recent chats.

The app flow is:

```text
Dashboard UI -> local API -> MCP client -> Codex MCP adapter -> ~/.codex/sessions
```

Codex does not need to run a loop or actively push data for this version. Agent Companion polls its own local API every 15 seconds, and the API asks the MCP adapter for the latest snapshot.

When an OpenAI snapshot includes model, input, cached input, and output counts, the API adds pricing
estimates before returning the response. API dollar estimates use OpenAI API token rates; Codex credit
estimates use the Codex token-based rate card.

## Why Use MCP Here?

MCP is the adapter boundary. The UI does not know how Codex stores logs, and the API does not need Codex-specific parsing logic. Codex, Claude Code, Cursor, or another agent can each expose the same tool shape:

```text
get_usage_snapshot
```

That lets the dashboard stay stable while adapters evolve independently.

## Future Push Options

If an agent later exposes a live telemetry stream, we can add one of these without changing the dashboard contract:

- File watching inside the adapter for faster local updates.
- An MCP server that reads directly from an official agent API.
- A push bridge where an agent plugin posts events into Agent Companion.
- A persistent WebSocket or Server-Sent Events channel from the local API to the UI.

For Codex specifically, the current reliable path is local pull from session logs. If Codex eventually exposes official runtime telemetry through MCP or another API, `packages/mcp-codex` is the only layer that should need to change.
