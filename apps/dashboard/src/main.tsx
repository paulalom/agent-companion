import React from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import "./styles.css";

type TokenCostEstimate = {
  total: number;
  lastTurn: number | null;
  unit: "USD" | "credits";
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
};

type PricingEstimate = {
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

type AgentUsageSnapshot = {
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

type UsageResponse = {
  snapshots: AgentUsageSnapshot[];
  capturedAt: string;
};

function apiUrl(path: string) {
  const apiBase = new URLSearchParams(window.location.search).get("api");
  if (!apiBase) return path;
  return `${apiBase.replace(/\/+$/, "")}${path}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
    notation: "compact"
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : 4;
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  })}`;
}

function formatCredits(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : 4;
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  })} cr`;
}

function detailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function statusDescription(snapshot: AgentUsageSnapshot) {
  if (snapshot.status === "ok") {
    return "Adapter connected and returning telemetry.";
  }

  if (snapshot.status === "unavailable") {
    return detailString(snapshot.details, "reason") ?? "Telemetry is not available for this adapter yet.";
  }

  return detailString(snapshot.details, "error") ?? "The adapter reported an error while reading telemetry.";
}

function useUsage() {
  const [data, setData] = React.useState<UsageResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/api/usage"));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { data, error, loading, refresh };
}

function ContextRing({ snapshot }: { snapshot: AgentUsageSnapshot }) {
  const percent = Math.max(0, Math.min(1, snapshot.percentContext ?? 0));
  const degrees = `${Math.round(percent * 360)}deg`;
  const tooltip = [
    `${snapshot.agentName}`,
    `Current context: ${formatNumber(snapshot.currentContextTokens)}`,
    `Max context: ${formatNumber(snapshot.maxContextTokens)}`,
    `Session total: ${formatNumber(snapshot.totalTokensUsed)}`,
    `Last turn: ${formatNumber(snapshot.lastTurnTokens)}`
  ].join("\n");

  return (
    <div
      className="context-ring"
      style={{ "--ring-fill": degrees } as React.CSSProperties}
      aria-label={`${snapshot.agentName} context usage ${formatPercent(snapshot.percentContext)}`}
      title={tooltip}
    >
      <span>{formatPercent(snapshot.percentContext)}</span>
    </div>
  );
}

function StatusPill({ snapshot }: { snapshot: AgentUsageSnapshot }) {
  const description = statusDescription(snapshot);

  return (
    <span
      className={`status-pill status-pill--${snapshot.status}`}
      aria-label={`${snapshot.status}: ${description}`}
      title={description}
    >
      {snapshot.status}
    </span>
  );
}

function SummaryStrip({ snapshots, capturedAt }: { snapshots: AgentUsageSnapshot[]; capturedAt: string | null }) {
  const apiTotal = sumDefined(snapshots.map((snapshot) => snapshot.pricing?.api?.total));
  const creditTotal = sumDefined(snapshots.map((snapshot) => snapshot.pricing?.codexCredits?.total));
  const highestContext = snapshots.reduce<number | null>((current, snapshot) => {
    if (snapshot.percentContext == null) return current;
    return current == null ? snapshot.percentContext : Math.max(current, snapshot.percentContext);
  }, null);
  const issues = snapshots.filter((snapshot) => snapshot.status !== "ok").length;

  return (
    <section className="summary-strip">
      <Metric label="Chats" value={String(snapshots.length)} />
      <Metric label="Max context" value={formatPercent(highestContext)} />
      <Metric label="Est. API" value={formatMoney(apiTotal)} />
      <Metric label="Codex credits" value={formatCredits(creditTotal)} />
      <Metric label="Issues" value={String(issues)} tone={issues > 0 ? "danger" : undefined} />
      <Metric label="Updated" value={capturedAt ? new Date(capturedAt).toLocaleTimeString() : "Waiting"} />
    </section>
  );
}

function SessionTable({ snapshots }: { snapshots: AgentUsageSnapshot[] }) {
  return (
    <section className="panel session-panel">
      <div className="table-scroll">
        <table className="session-table">
          <thead>
            <tr>
              <th>Chat</th>
              <th>Status</th>
              <th>Context</th>
              <th>Tokens</th>
              <th>Estimate</th>
              <th>Seen</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <SessionRow
                key={`${snapshot.agentId}-${snapshot.sessionId ?? snapshot.capturedAt}`}
                snapshot={snapshot}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SessionRow({ snapshot }: { snapshot: AgentUsageSnapshot }) {
  const project = projectLabel(snapshot);
  const model = snapshot.model ?? snapshot.pricing?.model ?? "model n/a";
  const effort = detailString(snapshot.details, "effort");
  const rowMeta = [snapshot.agentName, model, effort].filter(Boolean).join(" / ");

  return (
    <tr className={snapshot.status !== "ok" ? `session-row--${snapshot.status}` : undefined}>
      <td>
        <div className="chat-cell">
          <ContextRing snapshot={snapshot} />
          <div className="chat-identity">
            <strong title={snapshot.sessionLabel ?? snapshot.sessionId ?? project}>{project}</strong>
            <span title={rowMeta}>{rowMeta}</span>
            {snapshot.status !== "ok" ? <em>{statusDescription(snapshot)}</em> : null}
          </div>
        </div>
      </td>
      <td>
        <StatusPill snapshot={snapshot} />
      </td>
      <td>
        <StackedValue
          primary={formatPercent(snapshot.percentContext)}
          secondary={`${formatCompact(snapshot.currentContextTokens)} / ${formatCompact(snapshot.maxContextTokens)}`}
        />
      </td>
      <td>
        <StackedValue
          primary={formatCompact(snapshot.totalTokensUsed)}
          secondary={`last ${formatCompact(snapshot.lastTurnTokens)}`}
        />
      </td>
      <td title={pricingTooltip(snapshot)}>
        <StackedValue
          primary={formatMoney(snapshot.pricing?.api?.total)}
          secondary={formatCredits(snapshot.pricing?.codexCredits?.total)}
        />
      </td>
      <td>
        <StackedValue
          primary={new Date(snapshot.capturedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
          })}
          secondary={new Date(snapshot.capturedAt).toLocaleDateString([], {
            month: "short",
            day: "numeric"
          })}
        />
      </td>
    </tr>
  );
}

function StackedValue({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="stacked-value">
      <strong>{primary}</strong>
      <span>{secondary}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className={`metric${tone ? ` metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const { data, error, loading, refresh } = useUsage();
  const snapshots = React.useMemo(
    () =>
      [...(data?.snapshots ?? [])].sort(
        (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
      ),
    [data]
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Sparkles aria-hidden="true" />
          <div>
            <h1>Agent Companion</h1>
            <p>Agent telemetry</p>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={() => void refresh()} title="Refresh">
          <RefreshCw aria-hidden="true" className={loading ? "spin" : ""} />
          <span>Refresh</span>
        </button>
      </header>

      {error ? (
        <section
          className="notice notice--error"
          title="Agent Companion could not reach the local telemetry API."
        >
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </section>
      ) : null}

      {snapshots.length > 0 ? (
        <>
          <SummaryStrip snapshots={snapshots} capturedAt={data?.capturedAt ?? null} />
          <SessionTable snapshots={snapshots} />
        </>
      ) : (
        <EmptyState loading={loading} />
      )}
    </main>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <section className="panel empty-state">
      <h2>{loading ? "Loading telemetry" : "No telemetry available"}</h2>
    </section>
  );
}

function projectLabel(snapshot: AgentUsageSnapshot) {
  const cwd = detailString(snapshot.details, "cwd");
  if (cwd) {
    const parts = cwd.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) ?? cwd;
  }
  return snapshot.sessionLabel ?? snapshot.sessionId ?? "Latest session";
}

function pricingTooltip(snapshot: AgentUsageSnapshot) {
  if (!snapshot.pricing) {
    return "No pricing estimate available for this model or token data.";
  }

  const api = snapshot.pricing.api;
  const credits = snapshot.pricing.codexCredits;
  const lines = [
    `Model: ${snapshot.pricing.model}`,
    `Input: ${formatNumber(snapshot.pricing.basis.inputTokens)}`,
    `Cached input: ${formatNumber(snapshot.pricing.basis.cachedInputTokens)}`,
    `Output: ${formatNumber(snapshot.pricing.basis.outputTokens)}`
  ];

  if (api) {
    lines.push(
      `API: ${formatMoney(api.total)} total, ${formatMoney(api.lastTurn)} last turn`,
      `API rates: $${api.inputPerMillion}/${
        api.cachedInputPerMillion == null ? "n/a" : `$${api.cachedInputPerMillion}`
      }/$${api.outputPerMillion} per 1M input/cached/output`
    );
  }

  if (credits) {
    lines.push(
      `Codex: ${formatCredits(credits.total)} total, ${formatCredits(credits.lastTurn)} last turn`,
      `Codex rates: ${credits.inputPerMillion}/${credits.cachedInputPerMillion ?? "n/a"}/${
        credits.outputPerMillion
      } credits per 1M input/cached/output`
    );
  }

  return lines.join("\n");
}

function sumDefined(values: Array<number | null | undefined>) {
  const defined = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return defined.length > 0 ? defined.reduce((sum, value) => sum + value, 0) : null;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
