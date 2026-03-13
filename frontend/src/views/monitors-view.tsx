"use client";

import Link from "next/link";

import { DataTable, DataTableShell } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { StateBadge } from "@/components/state-badge";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate, formatDurationMs, formatPercent } from "@/lib/format";
import { checkRunSchema, monitorStatsSchema, overviewSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type MonitorsViewProps = {
  minutes: number;
  selectedMonitorId: number | null;
  serviceFilter: string | null;
  environmentFilter: string | null;
};

function severityTone(severity: "critical" | "high" | "medium" | "low") {
  if (severity == "critical") {
    return "error" as const;
  }
  if (severity == "high") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function incidentTone(state: "open" | "acknowledged" | "resolved") {
  if (state == "open") {
    return "error" as const;
  }
  if (state == "acknowledged") {
    return "warning" as const;
  }
  return "ok" as const;
}

export function MonitorsView({
  minutes,
  selectedMonitorId,
  serviceFilter,
  environmentFilter,
}: MonitorsViewProps) {
  const overviewQuery = useApiQuery(`/opswatch-api/api/stats/overview?minutes=${minutes}`, overviewSchema);

  const allMonitors = overviewQuery.data?.monitors ?? [];
  const services = Array.from(new Set(allMonitors.map((item) => item.monitor.service))).sort();
  const environments = Array.from(new Set(allMonitors.map((item) => item.monitor.environment))).sort();
  const monitors = allMonitors.filter((item) => {
    if (serviceFilter && item.monitor.service != serviceFilter) {
      return false;
    }
    if (environmentFilter && item.monitor.environment != environmentFilter) {
      return false;
    }
    return true;
  });

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
    return <EmptyState message="No monitors available for the selected ownership filters." />;
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
        description="Ownership-aware fleet view with service filters and selected-monitor drilldown."
        actions={
          <>
            <WindowSelector
              basePath="/monitors"
              minutes={minutes}
              params={{
                monitor: activeMonitor.monitor.id,
                service: serviceFilter ?? undefined,
                environment: environmentFilter ?? undefined,
              }}
            />
            <RefreshButton onRefresh={() => Promise.all([overviewQuery.mutate(), statsQuery.mutate(), runsQuery.mutate()])} />
          </>
        }
      />

      <form action="/monitors" method="get" className="grid gap-3 ow-panel p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <input type="hidden" name="minutes" value={minutes} />
        <input type="hidden" name="monitor" value={activeMonitor.monitor.id} />
        <label className="ow-field-label">
          Service
          <select name="service" defaultValue={serviceFilter ?? "all"} className="ow-input">
            <option value="all">All services</option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
        <label className="ow-field-label">
          Environment
          <select name="environment" defaultValue={environmentFilter ?? "all"} className="ow-input">
            <option value="all">All environments</option>
            {environments.map((environment) => (
              <option key={environment} value={environment}>
                {environment}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="ow-btn-primary w-full">
            Apply filters
          </button>
        </div>
        <div className="flex items-end">
          <Link href={`/monitors?minutes=${minutes}`} className="ow-btn-secondary w-full text-center">
            Reset
          </Link>
        </div>
      </form>

      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="uppercase tracking-[0.16em] text-slate-400">Fleet status</span>
          <StateBadge label={`up ${statusCounts.up}`} tone="ok" />
          <StateBadge label={`down ${statusCounts.down}`} tone="error" />
          <StateBadge label={`maintenance ${statusCounts.maintenance}`} tone="warning" />
          <StateBadge label={`unknown ${statusCounts.unknown}`} tone="neutral" />
          <StateBadge label={`visible ${monitors.length}`} tone="neutral" />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <DataTableShell>
          <DataTable className="min-w-[1040px]">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="ow-th">Name</th>
                <th className="ow-th">Ownership</th>
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
                const query = new URLSearchParams({
                  minutes: String(minutes),
                  monitor: String(item.monitor.id),
                });
                if (serviceFilter) {
                  query.set("service", serviceFilter);
                }
                if (environmentFilter) {
                  query.set("environment", environmentFilter);
                }

                return (
                  <tr key={item.monitor.id} className={`${rowClass} ow-row-hover`}>
                    <td className="ow-td">
                      <Link href={`/monitors?${query.toString()}`} className="font-medium text-slate-100 hover:text-accent">
                        {item.monitor.name}
                      </Link>
                      <p className="text-xs text-slate-400">{item.monitor.target}</p>
                    </td>
                    <td className="ow-td text-slate-300">
                      <p className="font-medium text-slate-200">{item.monitor.service}</p>
                      <p className="text-xs text-slate-400">
                        {item.monitor.environment} | {item.monitor.owner}
                      </p>
                      <div className="mt-1">
                        <StateBadge label={item.monitor.severity} tone={severityTone(item.monitor.severity)} />
                      </div>
                    </td>
                    <td className="ow-td">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="ow-td text-slate-300">{formatPercent(item.uptime_pct)}</td>
                    <td className="ow-td text-slate-300">{formatDurationMs(item.latency_ms.p95)}</td>
                    <td className="ow-td">
                      {item.open_incident ? (
                        <StateBadge
                          label={`${item.open_incident.state} #${item.open_incident.id}`}
                          tone={incidentTone(item.open_incident.state)}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">none</span>
                      )}
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
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Service</p>
              <p className="mt-1 text-slate-200">{activeMonitor.monitor.service}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Environment</p>
              <p className="mt-1 text-slate-200">{activeMonitor.monitor.environment}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Owner</p>
              <p className="mt-1 text-slate-200 break-all">{activeMonitor.monitor.owner}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Severity</p>
              <div className="mt-1">
                <StateBadge label={activeMonitor.monitor.severity} tone={severityTone(activeMonitor.monitor.severity)} />
              </div>
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

          {activeMonitor.monitor.runbook_url && (
            <Panel className="p-3 text-xs text-slate-300">
              <p className="font-medium text-slate-100">Runbook</p>
              <a
                href={activeMonitor.monitor.runbook_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-accent hover:text-white"
              >
                {activeMonitor.monitor.runbook_url}
              </a>
            </Panel>
          )}

          {activeMonitor.open_incident && (
            <Panel tone="critical" className="p-3 text-xs text-rose-200">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Active incident #{activeMonitor.open_incident.id}</p>
                <StateBadge label={activeMonitor.open_incident.state} tone={incidentTone(activeMonitor.open_incident.state)} />
              </div>
              <p className="mt-1">Opened {formatDate(activeMonitor.open_incident.opened_at)}</p>
              <p className="mt-1">{activeMonitor.open_incident.last_error ?? "No error message"}</p>
            </Panel>
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
        </Panel>
      </div>
    </div>
  );
}
