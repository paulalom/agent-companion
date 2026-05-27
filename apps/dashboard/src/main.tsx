import React from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, Cpu, RefreshCw, Server, Sparkles } from "lucide-react";
import "./styles.css";

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

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
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
    `Session total: ${formatNumber(snapshot.totalTokensUsed)}`
  ].join("\n");

  return (
    <div
      className="context-ring"
      style={{ "--ring-fill": degrees } as React.CSSProperties}
      aria-label={`${snapshot.agentName} context usage ${formatPercent(snapshot.percentContext)}`}
      title={tooltip}
    >
      <div className="context-ring__inner">
        <span>{formatPercent(snapshot.percentContext)}</span>
      </div>
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: AgentUsageSnapshot }) {
  return (
    <section className="panel snapshot-panel">
      <div className="panel__heading">
        <div>
          <h2>{snapshot.agentName}</h2>
          <p>{snapshot.sessionLabel ?? snapshot.sessionId ?? "Latest session"}</p>
        </div>
        <span className={`status-pill status-pill--${snapshot.status}`}>{snapshot.status}</span>
      </div>

      <div className="snapshot-grid">
        <ContextRing snapshot={snapshot} />
        <div className="metric-stack">
          <Metric label="Current context" value={formatNumber(snapshot.currentContextTokens)} />
          <Metric label="Max context" value={formatNumber(snapshot.maxContextTokens)} />
          <Metric label="Session total" value={formatNumber(snapshot.totalTokensUsed)} />
          <Metric label="Last turn" value={formatNumber(snapshot.lastTurnTokens)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const { data, error, loading, refresh } = useUsage();
  const snapshots = data?.snapshots ?? [];
  const primary = snapshots[0] ?? null;

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
        <section className="notice notice--error">
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </section>
      ) : null}

      <section className="overview">
        <div className="overview__main">
          {primary ? <SnapshotPanel snapshot={primary} /> : <EmptyState loading={loading} />}
        </div>

        <aside className="side-rail">
          <section className="panel compact-panel">
            <div className="panel__heading">
              <div>
                <h2>Sources</h2>
                <p>{snapshots.length} connected</p>
              </div>
              <Server aria-hidden="true" />
            </div>
            <div className="source-list">
              {snapshots.map((snapshot) => (
                <div className="source-row" key={snapshot.agentId}>
                  <span>{snapshot.agentName}</span>
                  <strong>{formatPercent(snapshot.percentContext)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel compact-panel">
            <div className="panel__heading">
              <div>
                <h2>Runtime</h2>
                <p>{data ? new Date(data.capturedAt).toLocaleTimeString() : "Waiting"}</p>
              </div>
              <Cpu aria-hidden="true" />
            </div>
            <Metric label="Adapters" value={String(snapshots.length)} />
            <Metric label="Refresh" value="15s" />
          </section>
        </aside>
      </section>
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
