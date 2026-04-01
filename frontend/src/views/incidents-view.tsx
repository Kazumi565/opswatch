"use client";

import Link from "next/link";
import { useState } from "react";

import { DataTable, DataTableShell } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { StateBadge } from "@/components/state-badge";
import { useCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ApiError, apiRequest } from "@/lib/http";
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
  const currentUser = useCurrentUser();
  const canRespond = currentUser.role === "programmer" || currentUser.role === "admin";
  const endpoint =
    scope == "open" ? "/opswatch-api/api/incidents/open?limit=200" : "/opswatch-api/api/incidents?limit=200";

  const incidentsQuery = useApiQuery(endpoint, incidentSchema.array());
  const incidents = incidentsQuery.data ?? [];
  const activeIncident = incidents.find((incident) => incident.id == selectedIncidentId) ?? incidents[0] ?? null;
  const incidentDetailQuery = useApiQuery(
    activeIncident ? `/opswatch-api/api/incidents/${activeIncident.id}` : null,
    incidentSchema,
  );
  const incidentDetail = incidentDetailQuery.data;
  const [noteValue, setNoteValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<"ack" | "note" | null>(null);

  async function refreshIncidentViews() {
    await Promise.all([incidentsQuery.mutate(), incidentDetailQuery.mutate()]);
  }

  async function acknowledgeIncident(incidentId: number) {
    setActionPending("ack");
    setActionError(null);
    try {
      await apiRequest(`/opswatch-api/api/incidents/${incidentId}/ack`, { method: "POST" }, { csrf: true });
      await refreshIncidentViews();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to acknowledge incident");
    } finally {
      setActionPending(null);
    }
  }

  async function addNote(incidentId: number) {
    if (!noteValue.trim()) {
      setActionError("Note must not be empty");
      return;
    }

    setActionPending("note");
    setActionError(null);
    try {
      await apiRequest(
        `/opswatch-api/api/incidents/${incidentId}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ note: noteValue }),
        },
        { csrf: true },
      );
      setNoteValue("");
      await refreshIncidentViews();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to add note");
    } finally {
      setActionPending(null);
    }
  }

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
            {incidentDetailQuery.isLoading && !incidentDetail && (
              <LoadingState message="Loading incident detail..." />
            )}
            {incidentDetail && (
              <>
                <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <h3 className="ow-section-title">Selected incident</h3>
                    <p className="mt-1 text-sm font-medium text-slate-100">
                      #{incidentDetail.id} · {incidentDetail.monitor_name ?? `Monitor ${incidentDetail.monitor_id}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {incidentDetail.service} / {incidentDetail.environment} / {incidentDetail.owner}
                    </p>
                  </div>
                  {incidentStateBadge(incidentDetail.state)}
                </header>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Severity</p>
                    <p className="mt-1 text-slate-200">{incidentDetail.severity}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Failure count</p>
                    <p className="mt-1 text-slate-200">{incidentDetail.failure_count}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Opened</p>
                    <p className="mt-1 text-slate-200">{formatDate(incidentDetail.opened_at)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Resolved</p>
                    <p className="mt-1 text-slate-200">{formatDate(incidentDetail.resolved_at)}</p>
                  </div>
                </div>

                {incidentDetail.runbook_url && (
                  <Panel className="p-3 text-xs text-slate-300">
                    <p className="font-medium text-slate-100">Runbook</p>
                    <a
                      href={incidentDetail.runbook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-accent hover:text-white"
                    >
                      {incidentDetail.runbook_url}
                    </a>
                  </Panel>
                )}

                <Panel tone="critical" className="p-3 text-xs text-rose-200">
                  <p className="font-medium">Last error</p>
                  <p className="mt-1">{incidentDetail.last_error ?? "No error message captured"}</p>
                </Panel>

                {canRespond ? (
                  <Panel className="space-y-3 p-3 text-sm text-slate-200">
                    <div className="flex flex-wrap items-center gap-2">
                      {incidentDetail.state == "open" ? (
                        <button
                          type="button"
                          className="ow-btn-primary"
                          onClick={() => acknowledgeIncident(incidentDetail.id)}
                          disabled={actionPending != null}
                        >
                          {actionPending == "ack" ? "Acknowledging..." : "Acknowledge incident"}
                        </button>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {currentUser.role === "admin" ? "Admin controls" : "Programmer controls"}
                      </span>
                    </div>

                    {incidentDetail.state != "resolved" ? (
                      <div className="space-y-2">
                        <label className="ow-field-label block">
                          Add incident note
                          <textarea
                            value={noteValue}
                            onChange={(event) => setNoteValue(event.target.value)}
                            className="ow-input min-h-28"
                            placeholder="What are you seeing, doing, or handing off?"
                          />
                        </label>
                        <button
                          type="button"
                          className="ow-btn-secondary"
                          onClick={() => addNote(incidentDetail.id)}
                          disabled={actionPending != null}
                        >
                          {actionPending == "note" ? "Saving note..." : "Add note"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">Resolved incidents cannot accept new operator notes.</p>
                    )}

                    {actionError ? <p className="text-xs text-rose-300">{actionError}</p> : null}
                  </Panel>
                ) : null}

                <div>
                  <h4 className="ow-section-title">Timeline</h4>
                  <p className="ow-section-subtitle">System lifecycle events and operator notes</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    {(incidentDetail.timeline ?? []).map((event) => (
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
                    {(incidentDetail.timeline ?? []).length === 0 && (
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
