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
import { formatDate } from "@/lib/format";
import { incidentSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type IncidentsViewProps = {
  scope: "open" | "all";
  selectedIncidentId: number | null;
};

function incidentStateBadge(state: "open" | "acknowledged" | "resolved") {
  if (state == "open") {
    return <StateBadge label="open" tone="error" />;
  }
  if (state == "acknowledged") {
    return <StateBadge label="acknowledged" tone="warning" />;
  }
  return <StateBadge label="resolved" tone="ok" />;
}

function incidentSignalBadge(state: "open" | "acknowledged" | "resolved", failureCount: number) {
  if (state == "resolved") {
    return <StateBadge label="cleared" tone="neutral" />;
  }
  if (failureCount >= 5) {
    return <StateBadge label="critical" tone="error" />;
  }
  if (state == "acknowledged") {
    return <StateBadge label="tracked" tone="warning" />;
  }
  return <StateBadge label="elevated" tone="warning" />;
}

function eventLabel(eventType: "opened" | "acknowledged" | "resolved" | "note_added") {
  if (eventType == "note_added") {
    return "note";
  }
  return eventType;
}

export function IncidentsView({ scope, selectedIncidentId }: IncidentsViewProps) {
  const endpoint =
    scope == "open" ? "/opswatch-api/api/incidents/open?limit=200" : "/opswatch-api/api/incidents?limit=200";

  const incidentsQuery = useApiQuery(endpoint, incidentSchema.array());
  const incidents = incidentsQuery.data ?? [];
  const activeIncident = incidents.find((incident) => incident.id == selectedIncidentId) ?? incidents[0] ?? null;
  const incidentDetailQuery = useApiQuery(
    activeIncident ? `/opswatch-api/api/incidents/${activeIncident.id}` : null,
    incidentSchema,
  );

  if (incidentsQuery.isLoading && !incidentsQuery.data) {
    return <LoadingState message="Loading incidents..." />;
  }

  const queryError = firstError(incidentsQuery.error, incidentDetailQuery.error);
  if (queryError) {
    return <ErrorState message={String(queryError)} />;
  }

  const openCount = incidents.filter((incident) => incident.state == "open").length;
  const acknowledgedCount = incidents.filter((incident) => incident.state == "acknowledged").length;
  const resolvedCount = incidents.filter((incident) => incident.state == "resolved").length;

  return (
    <div className="ow-page" data-testid="incidents-view">
      <PageHeader
        title="Incidents"
        description="Operational incident log with ownership context, lifecycle state, and recent timeline detail."
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
            <RefreshButton onRefresh={() => Promise.all([incidentsQuery.mutate(), incidentDetailQuery.mutate()])} />
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Panel className="p-4">
          <p className="ow-kpi-label">Rows loaded</p>
          <p className="ow-kpi-value">{incidents.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Open incidents</p>
          <p className="ow-kpi-value text-rose-300">{openCount}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Acknowledged</p>
          <p className="ow-kpi-value text-amber-300">{acknowledgedCount}</p>
        </Panel>
        <Panel className="p-4">
          <p className="ow-kpi-label">Resolved</p>
          <p className="ow-kpi-value text-emerald-300">{resolvedCount}</p>
        </Panel>
      </div>

      {incidents.length == 0 ? (
        <EmptyState message="No incidents found for the selected scope." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
          <DataTableShell>
            <DataTable className="min-w-[1160px]">
              <thead className="bg-slate-900/70">
                <tr>
                  <th className="ow-th">Incident</th>
                  <th className="ow-th">Monitor</th>
                  <th className="ow-th">Ownership</th>
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
                  const rowClass =
                    incident.id == activeIncident?.id ? "ow-row-selected" : index % 2 === 0 ? "ow-row" : "ow-row-alt";

                  return (
                    <tr key={incident.id} className={`${rowClass} ow-row-hover`}>
                      <td className="ow-td font-medium text-slate-200">
                        <Link href={`/incidents?scope=${scope}&incident=${incident.id}`} className="hover:text-accent">
                          #{incident.id}
                        </Link>
                      </td>
                      <td className="ow-td text-slate-300">
                        <p className="font-medium text-slate-200">{monitorName}</p>
                        <p className="text-xs text-slate-400">ID {incident.monitor_id}</p>
                      </td>
                      <td className="ow-td text-slate-300">
                        <p className="font-medium text-slate-200">{incident.service}</p>
                        <p className="text-xs text-slate-400">
                          {incident.environment} | {incident.owner}
                        </p>
                      </td>
                      <td className="ow-td text-slate-200">{incidentStateBadge(incident.state)}</td>
                      <td className="ow-td text-slate-200">{incidentSignalBadge(incident.state, incident.failure_count)}</td>
                      <td className="ow-td text-slate-300">{incident.failure_count}</td>
                      <td className="ow-td text-slate-300">{formatDate(incident.opened_at)}</td>
                      <td className="ow-td text-slate-300">{formatDate(incident.resolved_at)}</td>
                      <td className="ow-td max-w-80 text-rose-300">
                        <span className="block truncate" title={incident.last_error ?? ""}>
                          {incident.last_error ?? "-"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </DataTableShell>

          <Panel className="space-y-4 p-4">
            {incidentDetailQuery.isLoading && !incidentDetailQuery.data && (
              <LoadingState message="Loading incident detail..." />
            )}
            {incidentDetailQuery.data && (
              <>
                <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="ow-section-title">Selected incident</h3>
                    <p className="mt-1 text-sm font-medium text-slate-100">
                      #{incidentDetailQuery.data.id} ·{" "}
                      {incidentDetailQuery.data.monitor_name ?? `Monitor ${incidentDetailQuery.data.monitor_id}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {incidentDetailQuery.data.service} / {incidentDetailQuery.data.environment} /{" "}
                      {incidentDetailQuery.data.owner}
                    </p>
                  </div>
                  {incidentStateBadge(incidentDetailQuery.data.state)}
                </header>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Severity</p>
                    <p className="mt-1 text-slate-200">{incidentDetailQuery.data.severity}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Failure count</p>
                    <p className="mt-1 text-slate-200">{incidentDetailQuery.data.failure_count}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Opened</p>
                    <p className="mt-1 text-slate-200">{formatDate(incidentDetailQuery.data.opened_at)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Resolved</p>
                    <p className="mt-1 text-slate-200">{formatDate(incidentDetailQuery.data.resolved_at)}</p>
                  </div>
                </div>

                {incidentDetailQuery.data.runbook_url && (
                  <Panel className="p-3 text-xs text-slate-300">
                    <p className="font-medium text-slate-100">Runbook</p>
                    <a
                      href={incidentDetailQuery.data.runbook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-accent hover:text-white"
                    >
                      {incidentDetailQuery.data.runbook_url}
                    </a>
                  </Panel>
                )}

                <Panel tone="critical" className="p-3 text-xs text-rose-200">
                  <p className="font-medium">Last error</p>
                  <p className="mt-1">{incidentDetailQuery.data.last_error ?? "No error message captured"}</p>
                </Panel>

                <div>
                  <h4 className="ow-section-title">Timeline</h4>
                  <p className="ow-section-subtitle">System lifecycle events and operator notes</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    {(incidentDetailQuery.data.timeline ?? []).map((event) => (
                      <li key={event.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <StateBadge
                            label={eventLabel(event.event_type)}
                            tone={
                              event.event_type == "resolved"
                                ? "ok"
                                : event.event_type == "opened"
                                  ? "error"
                                  : "warning"
                            }
                          />
                          <span className="text-slate-400">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="mt-1 text-slate-400">Actor: {event.actor}</p>
                        {event.note ? <p className="mt-1 text-slate-200">{event.note}</p> : null}
                      </li>
                    ))}
                    {(incidentDetailQuery.data.timeline ?? []).length === 0 && (
                      <li className="text-slate-400">No timeline entries recorded.</li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
