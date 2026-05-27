export type AgentUsageSnapshot = {
  agentId: string;
  agentName: string;
  status: "ok" | "unavailable" | "error";
  capturedAt: string;
  sessionId?: string;
  sessionLabel?: string;
  model?: string;
  provider?: string;
  currentContextTokens: number | null;
  maxContextTokens: number | null;
  percentContext: number | null;
  totalTokensUsed: number | null;
  lastTurnTokens: number | null;
  pricing?: PricingEstimate;
  details?: Record<string, unknown>;
};

export type UsageSnapshotResult =
  | AgentUsageSnapshot
  | {
      snapshots: AgentUsageSnapshot[];
    };

export type PricingEstimate = {
  model: string;
  provider: "openai";
  api?: TokenCostEstimate;
  codexCredits?: TokenCostEstimate;
  basis: {
    inputTokens: number;
    cachedInputTokens: number;
    billableInputTokens: number;
    outputTokens: number;
  };
  sources: Array<{
    label: string;
    url: string;
  }>;
};

export type TokenCostEstimate = {
  total: number;
  lastTurn: number | null;
  unit: "USD" | "credits";
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
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
