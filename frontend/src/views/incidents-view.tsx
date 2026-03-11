"use client";

import Link from "next/link";

import { DataTable, DataTableShell } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StateBadge } from "@/components/state-badge";
import { formatDate } from "@/lib/format";
import { incidentSchema } from "@/lib/schemas";
import { useApiQuery } from "@/lib/use-api-query";

type IncidentsViewProps = {
  scope: "open" | "all";
};

function incidentStateBadge(status: string) {
  if (status == "open") {
    return <StateBadge label="open" tone="error" />;
  }
  if (status == "resolved") {
    return <StateBadge label="resolved" tone="ok" />;
  }
  return <StateBadge label={status} tone="neutral" />;
}

function incidentSignalBadge(status: string, failureCount: number) {
  if (status == "open" && failureCount >= 5) {
    return <StateBadge label="critical" tone="error" />;
  }
  if (status == "open") {
    return <StateBadge label="elevated" tone="warning" />;
  }
  return <StateBadge label="cleared" tone="neutral" />;
}

export function IncidentsView({ scope }: IncidentsViewProps) {
  const endpoint = scope == "open" ? "/opswatch-api/api/incidents/open?limit=200" : "/opswatch-api/api/incidents?limit=200";

  const incidentsQuery = useApiQuery(endpoint, incidentSchema.array());

  if (incidentsQuery.isLoading && !incidentsQuery.data) {
    return <LoadingState message="Loading incidents..." />;
  }

  if (incidentsQuery.error) {
    return <ErrorState message={String(incidentsQuery.error)} />;
  }

  const incidents = incidentsQuery.data ?? [];
  const openCount = incidents.filter((incident) => incident.status == "open").length;
  const resolvedCount = incidents.filter((incident) => incident.status == "resolved").length;

  return (
    <div className="ow-page" data-testid="incidents-view">
      <PageHeader
        title="Incidents"
        description="Operational incident log with monitor attribution and resolution state."
        actions={
          <>
            <Link
              href="/incidents?scope=open"
              className={`ow-btn-toggle ${scope == "open" ? "ow-btn-toggle-active" : "ow-btn-toggle-inactive"}`}
            >
              Open
            </Link>
            <Link
              href="/incidents?scope=all"
              className={`ow-btn-toggle ${scope == "all" ? "ow-btn-toggle-active" : "ow-btn-toggle-inactive"}`}
            >
              All
            </Link>
            <button type="button" onClick={() => incidentsQuery.mutate()} className="ow-btn-secondary">
              Refresh now
            </button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="p-4">
          <p className="ow-kpi-label">Rows loaded</p>
          <p className="ow-kpi-value">{incidents.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Open incidents</p>
          <p className="ow-kpi-value text-rose-300">{openCount}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Resolved incidents</p>
          <p className="ow-kpi-value text-emerald-300">{resolvedCount}</p>
        </Panel>
      </div>

      {incidents.length == 0 ? (
        <EmptyState message="No incidents found for the selected scope." />
      ) : (
        <DataTableShell>
          <DataTable className="min-w-[1120px]">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="ow-th">Incident</th>
                <th className="ow-th">Monitor</th>
                <th className="ow-th">State</th>
                <th className="ow-th">Signal</th>
                <th className="ow-th">Failures</th>
                <th className="ow-th">Opened</th>
                <th className="ow-th">Resolved</th>
                <th className="ow-th">Last error</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident, index) => {
                const monitorName = incident.monitor_name ?? `Monitor ${incident.monitor_id}`;
                const rowClass = index % 2 === 0 ? "ow-row" : "ow-row-alt";
                return (
                  <tr key={incident.id} className={`${rowClass} ow-row-hover`}>
                    <td className="ow-td font-medium text-slate-200">#{incident.id}</td>
                    <td className="ow-td text-slate-300">
                      <p className="font-medium text-slate-200">{monitorName}</p>
                      <p className="text-xs text-slate-400">ID {incident.monitor_id}</p>
                    </td>
                    <td className="ow-td text-slate-200">{incidentStateBadge(incident.status)}</td>
                    <td className="ow-td text-slate-200">{incidentSignalBadge(incident.status, incident.failure_count)}</td>
                    <td className="ow-td text-slate-300">{incident.failure_count}</td>
                    <td className="ow-td text-slate-300">{formatDate(incident.opened_at)}</td>
                    <td className="ow-td text-slate-300">{formatDate(incident.resolved_at)}</td>
                    <td className="ow-td max-w-80 text-rose-300">
                      <span className="block truncate" title={incident.last_error ?? ""}>{incident.last_error ?? "-"}</span>
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