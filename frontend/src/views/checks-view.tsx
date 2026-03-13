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
import { formatDate, formatDurationMs } from "@/lib/format";
import { checkRunSchema, monitorSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type ChecksViewProps = {
  success: "all" | "true" | "false";
  monitorId: number | null;
  limit: number;
};

function buildRunsPath(success: "all" | "true" | "false", monitorId: number | null, limit: number): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  if (success != "all") {
    params.set("success", success);
  }

  if (monitorId != null) {
    params.set("monitor_id", String(monitorId));
  }

  return `/opswatch-api/api/runs?${params.toString()}`;
}

function activeSuccessLabel(success: "all" | "true" | "false") {
  if (success == "true") {
    return "success only";
  }
  if (success == "false") {
    return "failures only";
  }
  return "all";
}

export function ChecksView({ success, monitorId, limit }: ChecksViewProps) {
  const monitorsQuery = useApiQuery("/opswatch-api/api/monitors", monitorSchema.array());
  const runsQuery = useApiQuery(buildRunsPath(success, monitorId, limit), checkRunSchema.array());

  if ((monitorsQuery.isLoading && !monitorsQuery.data) || (runsQuery.isLoading && !runsQuery.data)) {
    return <LoadingState message="Loading checks feed..." />;
  }

  const queryError = firstError(monitorsQuery.error, runsQuery.error);
  if (queryError) {
    return <ErrorState message={String(queryError)} />;
  }

  const monitors = monitorsQuery.data ?? [];
  const monitorNames = new Map(monitors.map((item) => [item.id, item.name]));
  const runs = runsQuery.data ?? [];
  const selectedMonitorName =
    monitorId == null ? "all monitors" : monitorNames.get(monitorId) ?? `Monitor ${monitorId}`;
  const failedRuns = runs.filter((run) => !run.success).length;

  return (
    <div className="ow-page" data-testid="checks-view">
      <PageHeader
        title="Checks"
        description="Recent execution feed with monitor filters and failure context."
        actions={<RefreshButton onRefresh={() => Promise.all([monitorsQuery.mutate(), runsQuery.mutate()])} />}
      />

      <Panel className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="uppercase tracking-[0.16em] text-slate-400">Active filters</span>
          <StateBadge label={`status ${activeSuccessLabel(success)}`} tone="neutral" />
          <StateBadge label={`monitor ${selectedMonitorName}`} tone="neutral" />
          <StateBadge label={`limit ${limit}`} tone="neutral" />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The UI refetches API data every 30 seconds. New rows appear when scheduled or manual checks finish,
          so fresh executions can land later than the poll interval.
        </p>
      </Panel>

      <form action="/checks" method="get" className="grid gap-3 ow-panel p-4 md:grid-cols-4">
        <label className="ow-field-label">
          Success
          <select name="success" defaultValue={success} className="ow-input">
            <option value="all">All</option>
            <option value="true">Success only</option>
            <option value="false">Failures only</option>
          </select>
        </label>

        <label className="ow-field-label">
          Monitor
          <select name="monitor" defaultValue={monitorId == null ? "all" : String(monitorId)} className="ow-input">
            <option value="all">All monitors</option>
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ow-field-label">
          Limit
          <input name="limit" type="number" min={1} max={500} defaultValue={limit} className="ow-input" />
        </label>

        <div className="flex items-end gap-2">
          <button type="submit" className="ow-btn-primary w-full">
            Apply filters
          </button>
          <Link href="/checks" className="ow-btn-secondary whitespace-nowrap">
            Reset
          </Link>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="ow-kpi-label">Rows loaded</p>
          <p className="ow-kpi-value">{runs.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Failures in result</p>
          <p className="ow-kpi-value text-rose-300">{failedRuns}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Selected monitor</p>
          <p className="mt-2 text-sm font-medium text-slate-100">{selectedMonitorName}</p>
        </Panel>
      </div>

      {runs.length == 0 ? (
        <EmptyState message="No check runs for the selected filters." />
      ) : (
        <DataTableShell>
          <DataTable className="min-w-[1080px]">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="ow-th">Run</th>
                <th className="ow-th">Monitor</th>
                <th className="ow-th">Status</th>
                <th className="ow-th">Started</th>
                <th className="ow-th">Duration</th>
                <th className="ow-th">Code</th>
                <th className="ow-th">Attempts</th>
                <th className="ow-th">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => {
                const monitorLabel = run.monitor_name ?? monitorNames.get(run.monitor_id) ?? `Monitor ${run.monitor_id}`;
                const rowClass = index % 2 === 0 ? "ow-row" : "ow-row-alt";

                return (
                  <tr key={run.id} className={`${rowClass} ow-row-hover`}>
                    <td className="ow-td font-medium text-slate-200">#{run.id}</td>
                    <td className="ow-td text-slate-300">
                      <p className="font-medium text-slate-200">{monitorLabel}</p>
                      <p className="text-xs text-slate-400">ID {run.monitor_id}</p>
                    </td>
                    <td className="ow-td text-slate-200">
                      <StateBadge label={run.success ? "success" : "failure"} tone={run.success ? "ok" : "error"} />
                    </td>
                    <td className="ow-td text-slate-300">{formatDate(run.started_at)}</td>
                    <td className="ow-td text-slate-300">{formatDurationMs(run.duration_ms)}</td>
                    <td className="ow-td text-slate-300">{run.status_code ?? "-"}</td>
                    <td className="ow-td text-slate-300">{run.attempts}</td>
                    <td className="ow-td max-w-72">
                      <span className={`block truncate ${run.error ? "text-rose-300" : "text-slate-400"}`} title={run.error ?? ""}>
                        {run.error ?? "-"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </DataTableShell>
      )}
    </div>
  );
}
