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
  summary?: string;
  model?: string;
  provider?: string;
  currentContextTokens: number | null;
  maxContextTokens: number | null;
  percentContext: number | null;
  totalTokensUsed: number | null;
  lastTurnTokens: number | null;
  tokensLastFiveMinutes: number | null;
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
    message?: string;
  };
  rate_limits?: {
    plan_type?: string;
  };
};

type SessionFile = {
  path: string;
  modifiedMs: number;
};

type TokenCountSample = {
  timestampMs: number;
  totalTokens: number;
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
  summary?: string;
  tokensLastFiveMinutes: number | null;
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
        tokensLastFiveMinutes: null,
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
  const tokenCounts: TokenCountSample[] = [];
  const userMessages: string[] = [];

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
          const sample = tokenCountSample(candidate);
          if (sample) {
            tokenCounts.push(sample);
          }
        } else if (candidate.payload?.type === "user_message") {
          const message = cleanUserMessage(candidate.payload.message);
          if (message) {
            userMessages.push(message);
          }
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
        source,
        summary: summarizeUserMessages(userMessages),
        tokensLastFiveMinutes: tokensUsedInWindow(tokenCounts, 5 * 60 * 1000)
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
    summary: summary.summary,
    model: summary.model,
    provider: summary.provider,
    currentContextTokens,
    maxContextTokens,
    percentContext,
    totalTokensUsed: numberOrNull(total.total_tokens),
    lastTurnTokens: numberOrNull(last.total_tokens),
    tokensLastFiveMinutes: summary.tokensLastFiveMinutes,
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
    tokensLastFiveMinutes: null,
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

function tokenCountSample(event: CodexTokenCountEvent): TokenCountSample | null {
  const timestampMs = event.timestamp ? Date.parse(event.timestamp) : Number.NaN;
  const totalTokens = numberOrNull(event.payload?.info?.total_token_usage?.total_tokens);
  if (!Number.isFinite(timestampMs) || totalTokens == null) return null;
  return { timestampMs, totalTokens };
}

function tokensUsedInWindow(samples: TokenCountSample[], windowMs: number, nowMs = Date.now()) {
  const cutoffMs = nowMs - windowMs;
  let previousTotal: number | null = null;
  let tokensUsed = 0;

  for (const sample of [...samples].sort((a, b) => a.timestampMs - b.timestampMs)) {
    const delta = previousTotal == null ? sample.totalTokens : sample.totalTokens - previousTotal;
    if (sample.timestampMs >= cutoffMs) {
      tokensUsed += Math.max(0, delta);
    }
    previousTotal = sample.totalTokens;
  }

  return tokensUsed;
}

function cleanUserMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("<environment_context")) return null;

  const cleaned = trimmed
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function summarizeUserMessages(messages: string[]) {
  const firstMessage = messages[0];
  if (!firstMessage) return undefined;

  const normalized = firstMessage
    .replace(/^(can|could) we\s+/i, "")
    .replace(/^let'?s\s+/i, "")
    .replace(/^i'?d like to\s+/i, "")
    .replace(/[\s"'`]+$/g, "");
  const sentences = splitSentences(normalized);
  const summary =
    sentences.find((sentence) => !isGenericMessage(sentence) && sentence.length >= 28) ??
    sentences.find((sentence) => !isGenericMessage(sentence)) ??
    normalized;

  return sentenceCase(clipSentence(summary, 180));
}

function clipSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return `${normalized.replace(/[.!?;:,]+$/g, "")}.`;
  }

  const clipped = normalized.slice(0, maxLength).replace(/\s+\S*$/, "");
  return `${clipped.replace(/[.!?;:,]+$/g, "")}...`;
}

function sentenceCase(value: string) {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function splitSentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isGenericMessage(value: string) {
  return /^(ok|okay|yes|no|thanks|thank you|cool|great|nice)[.!?]?$/i.test(value.trim());
}
