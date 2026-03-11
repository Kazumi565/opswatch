"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate, formatDurationMs, formatPercent } from "@/lib/format";
import { checkRunSchema, monitorStatsSchema, overviewSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type MonitorsViewProps = {
  minutes: number;
  selectedMonitorId: number | null;
};

export function MonitorsView({ minutes, selectedMonitorId }: MonitorsViewProps) {
  const overviewQuery = useApiQuery(`/opswatch-api/api/stats/overview?minutes=${minutes}`, overviewSchema);

  const monitors = overviewQuery.data?.monitors ?? [];
  const activeMonitor = monitors.find((item) => item.monitor.id == selectedMonitorId) ?? monitors[0] ?? null;

  const statsQuery = useApiQuery(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/stats?minutes=${minutes}` : null,
    monitorStatsSchema,
  );

  const runsQuery = useApiQuery(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/runs?limit=20` : null,
    checkRunSchema.array(),
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

  const detailError = firstError(statsQuery.error, runsQuery.error);

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

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-[760px] w-full text-sm">
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

        <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/45 p-4">
          <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Selected monitor</h3>
              <p className="mt-1 text-sm text-slate-200">{activeMonitor.monitor.name}</p>
              <p className="text-xs text-slate-400 break-all">{activeMonitor.monitor.target}</p>
            </div>
            <StatusPill status={activeMonitor.status} />
          </header>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Interval</p>
              <p className="mt-1 text-slate-200">{activeMonitor.monitor.interval_seconds}s</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Timeout</p>
              <p className="mt-1 text-slate-200">{activeMonitor.monitor.timeout_seconds}s</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Window uptime</p>
              <p className="mt-1 text-slate-200">{formatPercent(activeMonitor.uptime_pct)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Window p95</p>
              <p className="mt-1 text-slate-200">{formatDurationMs(activeMonitor.latency_ms.p95)}</p>
            </div>
          </div>

          {activeMonitor.open_incident && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              <p className="font-medium">Open incident #{activeMonitor.open_incident.id}</p>
              <p className="mt-1">Opened {formatDate(activeMonitor.open_incident.opened_at)}</p>
              <p className="mt-1">{activeMonitor.open_incident.last_error ?? "No error message"}</p>
            </div>
          )}

          {detailError ? <ErrorState message={String(detailError)} /> : null}

          {statsQuery.isLoading && !statsQuery.data && <LoadingState message="Loading monitor stats..." />}
          {statsQuery.data && (
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span>Total runs</span>
                <span className="font-medium text-slate-200">{statsQuery.data.runs.total}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Success</span>
                <span className="font-medium text-emerald-300">{statsQuery.data.runs.success}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Failure</span>
                <span className="font-medium text-rose-300">{statsQuery.data.runs.failure}</span>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Recent checks</h4>
            {runsQuery.isLoading && !runsQuery.data && <LoadingState message="Loading checks..." />}
            {runsQuery.data && runsQuery.data.length == 0 && (
              <EmptyState message="No recent checks for this monitor." />
            )}
            {runsQuery.data && runsQuery.data.length > 0 && (
              <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/10">
                <table className="min-w-[560px] w-full text-xs">
                  <thead className="bg-slate-900/60 text-left uppercase tracking-[0.12em] text-slate-400">
                    <tr>
                      <th className="px-2 py-2">Started</th>
                      <th className="px-2 py-2">Result</th>
                      <th className="px-2 py-2">Duration</th>
                      <th className="px-2 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runsQuery.data.slice(0, 10).map((run) => (
                      <tr key={run.id} className="bg-slate-950/40 align-top">
                        <td className="px-2 py-2 text-slate-300">{formatDate(run.started_at)}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex rounded-full border px-1.5 py-0.5 ${
                              run.success
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                            }`}
                          >
                            {run.success ? "success" : "failure"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-300">{formatDurationMs(run.duration_ms)}</td>
                        <td className="px-2 py-2 text-rose-300">{run.error ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}