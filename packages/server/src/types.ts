export type AgentUsageSnapshot = {
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
  details?: Record<string, unknown>;
};

export type McpServerConfig = {
  id: string;
  name: string;
  kind: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  usageTool?: string;
};

export type McpServersConfig = {
  servers: McpServerConfig[];
};
