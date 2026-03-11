"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StateBadge } from "@/components/state-badge";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate } from "@/lib/format";
import { overviewSchema, statusSchema, summarySchema, versionSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type OverviewViewProps = {
  minutes: number;
};

type MonitorYAxisTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
};

function trimLabel(label: string, limit = 18): string {
  return label.length > limit ? `${label.slice(0, Math.max(0, limit - 3))}...` : label;
}

function MonitorYAxisTick({ x = 0, y = 0, payload }: MonitorYAxisTickProps) {
  const fullLabel = payload?.value ?? "";

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#90a3b8" fontSize={12}>
        <title>{fullLabel}</title>
        {trimLabel(fullLabel)}
      </text>
    </g>
  );
}

const chartTooltipTheme = {
  contentStyle: {
    backgroundColor: "#0f172a",
    border: "1px solid rgba(148,163,184,0.35)",
    borderRadius: "0.5rem",
  },
  labelStyle: { color: "#e2e8f0", fontWeight: 600 },
  itemStyle: { color: "#e2e8f0" },
} as const;

export function OverviewView({ minutes }: OverviewViewProps) {
  const statusQuery = useApiQuery(`/opswatch-api/api/status?minutes=${minutes}`, statusSchema);
  const summaryQuery = useApiQuery("/opswatch-api/api/summary", summarySchema);
  const overviewQuery = useApiQuery(`/opswatch-api/api/stats/overview?minutes=${minutes}`, overviewSchema);
  const versionQuery = useApiQuery("/opswatch-api/api/version", versionSchema);

  const loading =
    statusQuery.isLoading || summaryQuery.isLoading || overviewQuery.isLoading || versionQuery.isLoading;

  if (loading && (!statusQuery.data || !summaryQuery.data || !overviewQuery.data || !versionQuery.data)) {
    return <LoadingState message="Loading overview telemetry..." />;
  }

  const queryError = firstError(statusQuery.error, summaryQuery.error, overviewQuery.error, versionQuery.error);
  if (queryError) {
    return <ErrorState message={String(queryError)} />;
  }

  const status = statusQuery.data;
  const summary = summaryQuery.data;
  const overview = overviewQuery.data;
  const version = versionQuery.data;

  if (!status || !summary || !overview || !version) {
    return <ErrorState message="Missing overview data from API." />;
  }

  const statusBuckets = {
    up: 0,
    down: 0,
    maintenance: 0,
    unknown: 0,
  };

  overview.monitors.forEach((monitor) => {
    statusBuckets[monitor.status] += 1;
  });

  const statusChartData = ["up", "down", "maintenance", "unknown"].map((statusName) => ({
    status: statusName,
    count: statusBuckets[statusName as keyof typeof statusBuckets],
  }));

  const latencyChartData = overview.monitors
    .map((item) => ({
      monitor: item.monitor.name,
      p95: item.latency_ms.p95 ?? 0,
    }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 10);

  const maintenanceCount = overview.monitors.filter((item) => item.maintenance.active).length;

  const riskState =
    status.open_incidents.length > 0
      ? {
          label: "Active incidents",
          tone: "error" as const,
          message: `${status.open_incidents.length} active incident(s) require attention`,
        }
      : status.overall === "degraded"
        ? {
            label: "Maintenance impact",
            tone: "warning" as const,
            message: "No active incidents; current degradation is maintenance-related",
          }
        : {
            label: "Stable",
            tone: "ok" as const,
            message: "No active incident-derived risk signals",
          };

  return (
    <div className="ow-page" data-testid="overview-view">
      <PageHeader
        title="Overview"
        description="Primary operational snapshot with monitor health, risk signals, and latency trends."
        actions={
          <>
            <WindowSelector basePath="/overview" minutes={minutes} />
            <button
              type="button"
              onClick={() => Promise.all([statusQuery.mutate(), summaryQuery.mutate(), overviewQuery.mutate(), versionQuery.mutate()])}
              className="ow-btn-secondary"
            >
              Refresh now
            </button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="ow-kpi-label">Overall status</p>
          <div className="mt-2">
            <StatusPill status={status.overall} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Window: last {minutes} minute(s)</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Monitors enabled</p>
          <p className="ow-kpi-value">
            {summary.monitors.enabled}
            <span className="ow-kpi-meta">/ {summary.monitors.total}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">Total configured service checks</p>
        </Panel>

        <Panel className={`p-4 ${summary.incidents.open > 0 ? "border-rose-500/30" : ""}`}>
          <p className="ow-kpi-label">Open incidents</p>
          <p className="ow-kpi-value text-rose-300">{summary.incidents.open}</p>
          <p className="mt-1 text-xs text-slate-400">
            {summary.incidents.open > 0 ? "Escalation signal is currently active" : "No unresolved incidents"}
          </p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Maintained monitors</p>
          <p className="ow-kpi-value text-indigo-300">{maintenanceCount}</p>
          <p className="mt-1 text-xs text-slate-400">Incident suppression currently active</p>
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ow-kpi-label">Current risk signal</p>
            <p className="mt-2 text-sm text-slate-200">{riskState.message}</p>
          </div>
          <StateBadge label={riskState.label} tone={riskState.tone} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h3 className="ow-section-title">Monitor status distribution</h3>
          <p className="ow-section-subtitle">Health buckets in the selected window</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis dataKey="status" stroke="#90a3b8" />
                <YAxis allowDecimals={false} stroke="#90a3b8" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} {...chartTooltipTheme} />
                <Bar dataKey="count" fill="#2ad0a9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-4">
          <h3 className="ow-section-title">Top monitor p95 latency (ms)</h3>
          <p className="ow-section-subtitle">Highest p95 monitors in the selected window</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={latencyChartData} margin={{ left: 8, right: 18 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis type="number" stroke="#90a3b8" />
                <YAxis dataKey="monitor" type="category" width={120} stroke="#90a3b8" tick={<MonitorYAxisTick />} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  {...chartTooltipTheme}
                  formatter={(value) => [`${value} ms`, "p95"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.monitor ?? ""}
                />
                <Bar dataKey="p95" fill="#f4c95d" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="ow-section-title">Recent open incidents</h3>
          <p className="text-xs text-slate-400">Generated: {formatDate(status.generated_at)}</p>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {status.open_incidents.slice(0, 5).map((incident) => (
            <li key={incident.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-rose-300">Incident #{incident.id}</span>
                  <StateBadge label="open" tone="error" />
                </div>
                <span className="text-xs text-slate-400">{incident.monitor_name ?? `Monitor ${incident.monitor_id}`}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Opened {formatDate(incident.opened_at)}</p>
              <p className="mt-1 text-xs text-rose-200/90">Last error: {incident.last_error ?? "-"}</p>
            </li>
          ))}
          {status.open_incidents.length === 0 && <li className="text-slate-400">No open incidents in this window.</li>}
        </ul>
      </Panel>

      <footer className="text-xs text-slate-500">
        API version {version.version} | commit {version.commit} | built {version.built_at}
      </footer>
    </div>
  );
}