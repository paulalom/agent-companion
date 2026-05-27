# Agent Telemetry MCP Contract

The dashboard expects agent telemetry MCP servers to expose a tool named `get_usage_snapshot`.

## Tool

```text
get_usage_snapshot
```

Input: no required arguments.

Output: JSON text and, when supported by the SDK, structured content matching:

```ts
type AgentUsageSnapshot = {
  agentId: string;
  agentName: string;
  status: "ok" | "unavailable" | "error";
  capturedAt: string;
  sessionId?: string;
  sessionLabel?: string;
  currentContextTokens: number | null;
  maxContextTokens: number | null;
  percentContext: number | null;
  totalTokensUsed: number | null;
  lastTurnTokens: number | null;
  tokensLastFiveMinutes: number | null;
  details?: Record<string, unknown>;
};
```

## Resource

Adapters may also expose:

```text
agent://<agent-id>/usage/current
```

The resource body should be the same JSON shape as the tool result.

## Adapter Guidance

Adapters should do the smallest reliable translation from an agent's native data into this contract. Do not make the dashboard parse agent-specific logs directly.
