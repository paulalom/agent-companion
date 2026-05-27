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
};

type SessionFile = {
  path: string;
  modifiedMs: number;
};

export async function getCodexUsageSnapshot(): Promise<AgentUsageSnapshot> {
  const codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  const sessionsDir = path.join(codexHome, "sessions");

  try {
    const files = await collectJsonlFiles(sessionsDir);
    if (files.length === 0) {
      return unavailable("No Codex session files found", { codexHome, sessionsDir });
    }

    files.sort((a, b) => b.modifiedMs - a.modifiedMs);
    for (const file of files.slice(0, 200)) {
      const event = await findLatestTokenCountEvent(file.path);
      if (event?.payload?.info) {
        return snapshotFromEvent(event, file.path);
      }
    }

    return unavailable("No token_count events found", { codexHome, sessionsDir });
  } catch (error) {
    return {
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
    };
  }
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

async function findLatestTokenCountEvent(filePath: string): Promise<CodexTokenCountEvent | null> {
  const content = await readFile(filePath, "utf8");
  const lines = content.trimEnd().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.includes("\"token_count\"")) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as CodexTokenCountEvent;
      if (parsed.payload?.type === "token_count") {
        return parsed;
      }
    } catch {
      // Skip malformed partial writes.
    }
  }
  return null;
}

function snapshotFromEvent(event: CodexTokenCountEvent, sessionPath: string): AgentUsageSnapshot {
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
    currentContextTokens,
    maxContextTokens,
    percentContext,
    totalTokensUsed: numberOrNull(total.total_tokens),
    lastTurnTokens: numberOrNull(last.total_tokens),
    details: {
      sessionPath,
      cachedInputTokens: numberOrNull(last.cached_input_tokens),
      outputTokens: numberOrNull(last.output_tokens),
      reasoningOutputTokens: numberOrNull(last.reasoning_output_tokens),
      totalInputTokens: numberOrNull(total.input_tokens),
      totalOutputTokens: numberOrNull(total.output_tokens)
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
