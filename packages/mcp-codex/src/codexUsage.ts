import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

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
  details?: Record<string, unknown>;
};

type CodexTokenUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
};

type CodexTokenCountInfo = {
  total_token_usage?: CodexTokenUsage;
  last_token_usage?: CodexTokenUsage;
  model_context_window?: number;
};

type CodexTokenCountEvent = {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    info?: CodexTokenCountInfo;
  };
  rate_limits?: {
    plan_type?: string;
  };
};

type SessionFile = {
  path: string;
  modifiedMs: number;
};

type SessionMetaEvent = {
  payload?: {
    cwd?: string;
    model_provider?: string;
    originator?: string;
    source?: string;
  };
};

type TurnContextEvent = {
  payload?: {
    cwd?: string;
    effort?: string;
    model?: string;
  };
};

type CodexSessionSummary = {
  cwd?: string;
  effort?: string;
  event: CodexTokenCountEvent;
  model?: string;
  originator?: string;
  provider?: string;
  sessionPath: string;
  source?: string;
};

export async function getCodexUsageSnapshot(): Promise<AgentUsageSnapshot> {
  const snapshots = await getCodexUsageSnapshots(1);
  return snapshots[0] ?? unavailable("No token_count events found", defaultUnavailableDetails());
}

export async function getCodexUsageSnapshots(limit = 12): Promise<AgentUsageSnapshot[]> {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  const sessionsDir = path.join(codexHome, "sessions");
  const count = Math.max(1, Math.min(50, Math.trunc(limit)));

  try {
    const files = await collectJsonlFiles(sessionsDir);
    if (files.length === 0) {
      return [unavailable("No Codex session files found", { codexHome, sessionsDir })];
    }

    files.sort((a, b) => b.modifiedMs - a.modifiedMs);
    const snapshots: AgentUsageSnapshot[] = [];
    for (const file of files.slice(0, 200)) {
      const summary = await readSessionSummary(file.path);
      if (summary?.event.payload?.info) {
        snapshots.push(snapshotFromSession(summary));
      }
      if (snapshots.length >= count) {
        return snapshots;
      }
    }

    return snapshots.length > 0
      ? snapshots
      : [unavailable("No token_count events found", { codexHome, sessionsDir })];
  } catch (error) {
    return [
      {
        agentId: "codex-local",
        agentName: "Codex Local",
        status: "error",
        capturedAt: new Date().toISOString(),
        currentContextTokens: null,
        maxContextTokens: null,
        percentContext: null,
        totalTokensUsed: null,
        lastTurnTokens: null,
        details: {
          error: error instanceof Error ? error.message : String(error),
          codexHome,
          sessionsDir
        }
      }
    ];
  }
}

function defaultUnavailableDetails() {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  const sessionsDir = path.join(codexHome, "sessions");
  return { codexHome, sessionsDir };
}

async function collectJsonlFiles(root: string): Promise<SessionFile[]> {
  const results: SessionFile[] = [];
  await walk(root, results);
  return results;
}

async function walk(dir: string, results: SessionFile[]) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, results);
        return;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        return;
      }
      const fileStat = await stat(fullPath);
      results.push({ path: fullPath, modifiedMs: fileStat.mtimeMs });
    })
  );
}

async function readSessionSummary(filePath: string): Promise<CodexSessionSummary | null> {
  const content = await readFile(filePath, "utf8");
  const lines = content.trimEnd().split(/\r?\n/);

  let cwd: string | undefined;
  let effort: string | undefined;
  let event: CodexTokenCountEvent | null = null;
  let model: string | undefined;
  let originator: string | undefined;
  let provider: string | undefined;
  let source: string | undefined;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type?: string; payload?: unknown };
      if (parsed.type === "session_meta") {
        const meta = parsed as SessionMetaEvent;
        cwd = stringOrUndefined(meta.payload?.cwd) ?? cwd;
        originator = stringOrUndefined(meta.payload?.originator) ?? originator;
        provider = stringOrUndefined(meta.payload?.model_provider) ?? provider;
        source = stringOrUndefined(meta.payload?.source) ?? source;
      } else if (parsed.type === "turn_context") {
        const turnContext = parsed as TurnContextEvent;
        cwd = stringOrUndefined(turnContext.payload?.cwd) ?? cwd;
        effort = stringOrUndefined(turnContext.payload?.effort) ?? effort;
        model = stringOrUndefined(turnContext.payload?.model) ?? model;
      } else if (parsed.type === "event_msg") {
        const candidate = parsed as CodexTokenCountEvent;
        if (candidate.payload?.type === "token_count") {
          event = candidate;
        }
      }
    } catch {
      // Skip malformed partial writes.
    }
  }

  return event
    ? {
        cwd,
        effort,
        event,
        model,
        originator,
        provider,
        sessionPath: filePath,
        source
      }
    : null;
}

function snapshotFromSession(summary: CodexSessionSummary): AgentUsageSnapshot {
  const { event, sessionPath } = summary;
  const info = event.payload?.info ?? {};
  const last = info.last_token_usage ?? {};
  const total = info.total_token_usage ?? {};
  const currentContextTokens = numberOrNull(last.input_tokens);
  const maxContextTokens = numberOrNull(info.model_context_window);
  const percentContext =
    currentContextTokens != null && maxContextTokens != null && maxContextTokens > 0
      ? currentContextTokens / maxContextTokens
      : null;

  return {
    agentId: "codex-local",
    agentName: "Codex Local",
    status: "ok",
    capturedAt: event.timestamp ?? new Date().toISOString(),
    sessionId: path.basename(sessionPath, ".jsonl"),
    sessionLabel: path.basename(sessionPath),
    model: summary.model,
    provider: summary.provider,
    currentContextTokens,
    maxContextTokens,
    percentContext,
    totalTokensUsed: numberOrNull(total.total_tokens),
    lastTurnTokens: numberOrNull(last.total_tokens),
    details: {
      sessionPath,
      cwd: summary.cwd,
      effort: summary.effort,
      originator: summary.originator,
      planType: event.rate_limits?.plan_type,
      source: summary.source,
      cachedInputTokens: numberOrNull(last.cached_input_tokens),
      inputTokens: numberOrNull(last.input_tokens),
      outputTokens: numberOrNull(last.output_tokens),
      reasoningOutputTokens: numberOrNull(last.reasoning_output_tokens),
      totalCachedInputTokens: numberOrNull(total.cached_input_tokens),
      totalInputTokens: numberOrNull(total.input_tokens),
      totalOutputTokens: numberOrNull(total.output_tokens),
      totalReasoningOutputTokens: numberOrNull(total.reasoning_output_tokens)
    }
  };
}

function unavailable(reason: string, details: Record<string, unknown>): AgentUsageSnapshot {
  return {
    agentId: "codex-local",
    agentName: "Codex Local",
    status: "unavailable",
    capturedAt: new Date().toISOString(),
    currentContextTokens: null,
    maxContextTokens: null,
    percentContext: null,
    totalTokensUsed: null,
    lastTurnTokens: null,
    details: {
      reason,
      ...details
    }
  };
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
