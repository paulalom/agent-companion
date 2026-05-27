import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentUsageSnapshot, McpServerConfig, UsageSnapshotResult } from "./types.js";

type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
};

const defaultUsageTool = "get_usage_snapshot";

export async function getUsageSnapshots(serverConfig: McpServerConfig): Promise<AgentUsageSnapshot[]> {
  const client = new Client({
    name: "agent-companion",
    version: "0.1.0"
  });

  const transport = new StdioClientTransport({
    command: normalizeCommand(serverConfig.command),
    args: serverConfig.args ?? [],
    env: mergeEnv(serverConfig.env)
  });

  try {
    await client.connect(transport);
    const result = (await client.callTool({
      name: serverConfig.usageTool ?? defaultUsageTool,
      arguments: {}
    })) as ToolResult;
    return parseToolResult(result, serverConfig);
  } catch (error) {
    return [
      {
        agentId: serverConfig.id,
        agentName: serverConfig.name,
        status: "error",
        capturedAt: new Date().toISOString(),
        currentContextTokens: null,
        maxContextTokens: null,
        percentContext: null,
        totalTokensUsed: null,
        lastTurnTokens: null,
        tokensLastFiveMinutes: null,
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      }
    ];
  } finally {
    await client.close().catch(() => undefined);
  }
}

function parseToolResult(result: ToolResult, serverConfig: McpServerConfig): AgentUsageSnapshot[] {
  if (isSnapshotResult(result.structuredContent)) {
    return normalizeSnapshotResult(result.structuredContent);
  }

  const text = result.content?.find((item) => item.type === "text" && item.text)?.text;
  if (text) {
    const parsed = JSON.parse(text) as unknown;
    if (isSnapshotResult(parsed)) {
      return normalizeSnapshotResult(parsed);
    }
  }

  return [
    {
      agentId: serverConfig.id,
      agentName: serverConfig.name,
      status: "error",
      capturedAt: new Date().toISOString(),
      currentContextTokens: null,
      maxContextTokens: null,
      percentContext: null,
      totalTokensUsed: null,
      lastTurnTokens: null,
      tokensLastFiveMinutes: null,
      details: {
        error: "MCP tool did not return an AgentUsageSnapshot"
      }
    }
  ];
}

function normalizeSnapshotResult(result: UsageSnapshotResult): AgentUsageSnapshot[] {
  return isSnapshot(result) ? [result] : result.snapshots;
}

function isSnapshotResult(value: unknown): value is UsageSnapshotResult {
  return isSnapshot(value) || isSnapshotCollection(value);
}

function isSnapshotCollection(value: unknown): value is { snapshots: AgentUsageSnapshot[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { snapshots?: unknown };
  return Array.isArray(candidate.snapshots) && candidate.snapshots.every(isSnapshot);
}

function isSnapshot(value: unknown): value is AgentUsageSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentUsageSnapshot>;
  return (
    typeof candidate.agentId === "string" &&
    typeof candidate.agentName === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.capturedAt === "string"
  );
}

function normalizeCommand(command: string) {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
  }
  return command;
}

function mergeEnv(extraEnv: Record<string, string> | undefined) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return { ...env, ...(extraEnv ?? {}) };
}
