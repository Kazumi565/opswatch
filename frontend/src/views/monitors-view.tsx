"use client";

import Link from "next/link";
import useSWR from "swr";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate, formatDurationMs, formatPercent } from "@/lib/format";
import { fetchAndParse } from "@/lib/http";
import { checkRunSchema, monitorStatsSchema, overviewSchema } from "@/lib/schemas";

type MonitorsViewProps = {
  minutes: number;
  selectedMonitorId: number | null;
};

export function MonitorsView({ minutes, selectedMonitorId }: MonitorsViewProps) {
  const overviewQuery = useSWR(
    `/opswatch-api/api/stats/overview?minutes=${minutes}`,
    (path: string) => fetchAndParse(path, overviewSchema),
    { refreshInterval: 30_000 },
  );

  const monitors = overviewQuery.data?.monitors ?? [];
  const activeMonitor = monitors.find((item) => item.monitor.id == selectedMonitorId) ?? monitors[0] ?? null;

  const statsQuery = useSWR(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/stats?minutes=${minutes}` : null,
    (path: string) => fetchAndParse(path, monitorStatsSchema),
    { refreshInterval: 30_000 },
  );

  const runsQuery = useSWR(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/runs?limit=20` : null,
    (path: string) => fetchAndParse(path, checkRunSchema.array()),
    { refreshInterval: 30_000 },
  );

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingState message="Loading monitor overview..." />;
  }

  if (overviewQuery.error) {
    return <ErrorState message={String(overviewQuery.error)} />;
  }

  if (!overviewQuery.data || monitors.length == 0 || !activeMonitor) {
    return <EmptyState message="No monitors available yet." />;
  }

  return (
    <div className="space-y-5" data-testid="monitors-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Monitors</h2>
        <div className="flex items-center gap-2">
          <WindowSelector basePath="/monitors" minutes={minutes} params={{ monitor: activeMonitor.monitor.id }} />
          <button
            type="button"
            onClick={() => Promise.all([overviewQuery.mutate(), statsQuery.mutate(), runsQuery.mutate()])}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:border-white/50"
          >
            Refresh now
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Uptime</th>
                <th className="px-3 py-3">p95</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((item) => {
                const selected = item.monitor.id == activeMonitor.monitor.id;
                return (
                  <tr key={item.monitor.id} className={selected ? "bg-accent/10" : "bg-slate-950/30"}>
                    <td className="px-3 py-3">
                      <Link
                        href={`/monitors?minutes=${minutes}&monitor=${item.monitor.id}`}
                        className="font-medium text-slate-100 hover:text-accent"
                      >
                        {item.monitor.name}
                      </Link>
                      <p className="text-xs text-slate-400">{item.monitor.target}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{item.monitor.type}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-3 py-3 text-slate-300">{formatPercent(item.uptime_pct)}</td>
                    <td className="px-3 py-3 text-slate-300">{formatDurationMs(item.latency_ms.p95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <h3 className="text-sm font-semibold">Selected monitor details</h3>
          <p className="text-sm text-slate-200">{activeMonitor.monitor.name}</p>
          <p className="text-xs text-slate-400">{activeMonitor.monitor.target}</p>
          <p className="text-xs text-slate-400">Interval {activeMonitor.monitor.interval_seconds}s</p>

          {statsQuery.isLoading && !statsQuery.data && <LoadingState message="Loading monitor stats..." />}
          {statsQuery.error && <ErrorState message={String(statsQuery.error)} />}

          {statsQuery.data && (
            <div className="space-y-1 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
              <p>Runs: {statsQuery.data.runs.total}</p>
              <p>Success: {statsQuery.data.runs.success}</p>
              <p>Failure: {statsQuery.data.runs.failure}</p>
              <p>Uptime: {formatPercent(statsQuery.data.runs.uptime_pct)}</p>
              <p>p95 latency: {formatDurationMs(statsQuery.data.latency_ms.p95)}</p>
            </div>
          )}

          <div>
            <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Recent checks</h4>
            {runsQuery.isLoading && !runsQuery.data && <LoadingState message="Loading checks..." />}
            {runsQuery.error && <ErrorState message={String(runsQuery.error)} />}
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {runsQuery.data?.slice(0, 5).map((run) => (
                <li key={run.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-2">
                  <p className="font-medium">{run.success ? "Success" : "Failure"}</p>
                  <p>{formatDate(run.started_at)}</p>
                  <p>{formatDurationMs(run.duration_ms)}</p>
                  <p className="text-rose-300">{run.error ?? "-"}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

