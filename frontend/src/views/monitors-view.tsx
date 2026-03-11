"use client";

import Link from "next/link";

import { DataTable, DataTableShell } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StateBadge } from "@/components/state-badge";
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

  const statusCounts = {
    up: 0,
    down: 0,
    maintenance: 0,
    unknown: 0,
  };

  for (const item of monitors) {
    statusCounts[item.status] += 1;
  }

  const detailError = firstError(statsQuery.error, runsQuery.error);

  return (
    <div className="ow-page" data-testid="monitors-view">
      <PageHeader
        title="Monitors"
        description="Monitor fleet view with selected-monitor drilldown and recent execution context."
        actions={
          <>
            <WindowSelector basePath="/monitors" minutes={minutes} params={{ monitor: activeMonitor.monitor.id }} />
            <button
              type="button"
              onClick={() => Promise.all([overviewQuery.mutate(), statsQuery.mutate(), runsQuery.mutate()])}
              className="ow-btn-secondary"
            >
              Refresh now
            </button>
          </>
        }
      />

      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="uppercase tracking-[0.16em] text-slate-400">Fleet status</span>
          <StateBadge label={`up ${statusCounts.up}`} tone="ok" />
          <StateBadge label={`down ${statusCounts.down}`} tone="error" />
          <StateBadge label={`maintenance ${statusCounts.maintenance}`} tone="warning" />
          <StateBadge label={`unknown ${statusCounts.unknown}`} tone="neutral" />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <DataTableShell>
          <DataTable className="min-w-[860px]">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="ow-th">Name</th>
                <th className="ow-th">Type</th>
                <th className="ow-th">Status</th>
                <th className="ow-th">Uptime</th>
                <th className="ow-th">p95</th>
                <th className="ow-th">Incident</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((item, index) => {
                const selected = item.monitor.id == activeMonitor.monitor.id;
                const rowClass = selected ? "ow-row-selected" : index % 2 === 0 ? "ow-row" : "ow-row-alt";
                return (
                  <tr key={item.monitor.id} className={`${rowClass} ow-row-hover`}>
                    <td className="ow-td">
                      <Link
                        href={`/monitors?minutes=${minutes}&monitor=${item.monitor.id}`}
                        className="font-medium text-slate-100 hover:text-accent"
                      >
                        {item.monitor.name}
                      </Link>
                      <p className="text-xs text-slate-400">{item.monitor.target}</p>
                    </td>
                    <td className="ow-td text-slate-300">{item.monitor.type}</td>
                    <td className="ow-td">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="ow-td text-slate-300">{formatPercent(item.uptime_pct)}</td>
                    <td className="ow-td text-slate-300">{formatDurationMs(item.latency_ms.p95)}</td>
                    <td className="ow-td">
                      {item.open_incident ? <StateBadge label={`#${item.open_incident.id}`} tone="error" /> : <span className="text-xs text-slate-500">none</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </DataTableShell>

        <Panel className="space-y-4 p-4">
          <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="ow-section-title">Selected monitor</h3>
              <p className="mt-1 text-sm font-medium text-slate-100">{activeMonitor.monitor.name}</p>
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
            <Panel tone="critical" className="p-3 text-xs text-rose-200">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Open incident #{activeMonitor.open_incident.id}</p>
                <StateBadge label="active" tone="error" />
              </div>
              <p className="mt-1">Opened {formatDate(activeMonitor.open_incident.opened_at)}</p>
              <p className="mt-1">{activeMonitor.open_incident.last_error ?? "No error message"}</p>
            </Panel>
          )}

          {detailError ? <ErrorState message={String(detailError)} /> : null}

          {statsQuery.isLoading && !statsQuery.data && <LoadingState message="Loading monitor stats..." />}
          {statsQuery.data && (
            <Panel className="p-3 text-xs text-slate-300">
              <h4 className="mb-2 uppercase tracking-[0.12em] text-slate-400">Run outcomes</h4>
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
            </Panel>
          )}

          <div>
            <h4 className="ow-section-title">Recent checks</h4>
            <p className="ow-section-subtitle">Latest check executions for the selected monitor</p>
            {runsQuery.isLoading && !runsQuery.data && <LoadingState message="Loading checks..." />}
            {runsQuery.data && runsQuery.data.length == 0 && <EmptyState message="No recent checks for this monitor." />}
            {runsQuery.data && runsQuery.data.length > 0 && (
              <DataTableShell className="mt-2 max-h-72 overflow-auto">
                <DataTable className="min-w-[620px] text-xs">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="ow-th">Started</th>
                      <th className="ow-th">Result</th>
                      <th className="ow-th">Duration</th>
                      <th className="ow-th">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runsQuery.data.slice(0, 10).map((run, index) => (
                      <tr key={run.id} className={index % 2 === 0 ? "ow-row" : "ow-row-alt"}>
                        <td className="ow-td text-slate-300">{formatDate(run.started_at)}</td>
                        <td className="ow-td">
                          <StateBadge label={run.success ? "success" : "failure"} tone={run.success ? "ok" : "error"} />
                        </td>
                        <td className="ow-td text-slate-300">{formatDurationMs(run.duration_ms)}</td>
                        <td className="ow-td text-rose-300">
                          <span className="block truncate" title={run.error ?? ""}>{run.error ?? "-"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </DataTableShell>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}