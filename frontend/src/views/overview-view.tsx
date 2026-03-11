"use client";

import useSWR from "swr";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate } from "@/lib/format";
import { fetchAndParse } from "@/lib/http";
import { overviewSchema, statusSchema, summarySchema, versionSchema } from "@/lib/schemas";

type OverviewViewProps = {
  minutes: number;
};

function isLoading(...flags: boolean[]) {
  return flags.some(Boolean);
}

export function OverviewView({ minutes }: OverviewViewProps) {
  const statusQuery = useSWR(
    `/opswatch-api/api/status?minutes=${minutes}`,
    (path: string) => fetchAndParse(path, statusSchema),
    { refreshInterval: 30_000 },
  );
  const summaryQuery = useSWR("/opswatch-api/api/summary", (path: string) => fetchAndParse(path, summarySchema), {
    refreshInterval: 30_000,
  });
  const overviewQuery = useSWR(
    `/opswatch-api/api/stats/overview?minutes=${minutes}`,
    (path: string) => fetchAndParse(path, overviewSchema),
    { refreshInterval: 30_000 },
  );
  const versionQuery = useSWR("/opswatch-api/api/version", (path: string) => fetchAndParse(path, versionSchema), {
    refreshInterval: 30_000,
  });

  const loading = isLoading(
    statusQuery.isLoading,
    summaryQuery.isLoading,
    overviewQuery.isLoading,
    versionQuery.isLoading,
  );

  if (loading && (!statusQuery.data || !summaryQuery.data || !overviewQuery.data || !versionQuery.data)) {
    return <LoadingState message="Loading overview telemetry..." />;
  }

  const error = statusQuery.error ?? summaryQuery.error ?? overviewQuery.error ?? versionQuery.error;
  if (error) {
    return <ErrorState message={String(error)} />;
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

  const statusChartData = Object.entries(statusBuckets).map(([name, value]) => ({
    status: name,
    count: value,
  }));

  const latencyChartData = overview.monitors.map((item) => ({
    monitor: item.monitor.name,
    p95: item.latency_ms.p95 ?? 0,
  }));

  const maintenanceCount = overview.monitors.filter((item) => item.maintenance.active).length;

  const alertSummary =
    status.open_incidents.length > 0
      ? `${status.open_incidents.length} active incident(s) require attention`
      : status.overall === "degraded"
        ? "No active incidents; system is degraded due to maintenance impact"
        : "No active incident-derived alerts";

  return (
    <div className="space-y-5" data-testid="overview-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <div className="flex items-center gap-2">
          <WindowSelector basePath="/overview" minutes={minutes} />
          <button
            type="button"
            onClick={() => Promise.all([statusQuery.mutate(), summaryQuery.mutate(), overviewQuery.mutate(), versionQuery.mutate()])}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:border-white/50"
          >
            Refresh now
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Overall status</p>
          <div className="mt-2">
            <StatusPill status={status.overall} />
          </div>
        </article>
        <article className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Monitors enabled</p>
          <p className="mt-2 text-2xl font-semibold">
            {summary.monitors.enabled}
            <span className="ml-2 text-sm font-normal text-slate-400">/ {summary.monitors.total}</span>
          </p>
        </article>
        <article className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open incidents</p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">{summary.incidents.open}</p>
        </article>
        <article className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Maintained monitors</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-300">{maintenanceCount}</p>
        </article>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Alert signal (incident-derived)</p>
        <p className="mt-2 text-sm text-slate-200">{alertSummary}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Monitor status distribution</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis dataKey="status" stroke="#90a3b8" />
                <YAxis allowDecimals={false} stroke="#90a3b8" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar dataKey="count" fill="#2ad0a9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <h3 className="text-sm font-semibold text-slate-200">p95 latency by monitor (ms)</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyChartData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis dataKey="monitor" stroke="#90a3b8" interval={0} angle={-20} textAnchor="end" height={80} />
                <YAxis allowDecimals={false} stroke="#90a3b8" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar dataKey="p95" fill="#f4c95d" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Recent open incidents</h3>
          <p className="text-xs text-slate-400">Generated: {formatDate(status.generated_at)}</p>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {status.open_incidents.slice(0, 5).map((incident) => (
            <li key={incident.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-rose-300">Incident #{incident.id}</span>
                <span className="text-xs text-slate-400">Monitor {incident.monitor_id}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Opened {formatDate(incident.opened_at)}</p>
              <p className="mt-1 text-xs text-slate-400">Last error: {incident.last_error ?? "-"}</p>
            </li>
          ))}
          {status.open_incidents.length === 0 && <li className="text-slate-400">No open incidents in this window.</li>}
        </ul>
      </div>

      <footer className="text-xs text-slate-500">
        API version {version.version} | commit {version.commit} | built {version.built_at}
      </footer>
    </div>
  );
}

