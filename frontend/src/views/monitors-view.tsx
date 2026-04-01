"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
import { hasRole, useCurrentUser } from "@/lib/auth";
import { formatDate, formatDurationMs, formatPercent } from "@/lib/format";
import { ApiError, apiRequest } from "@/lib/http";
import {
  checkRunSchema,
  maintenanceSchemaOut,
  monitorSchema,
  monitorStatsSchema,
  overviewSchema,
  type Monitor,
} from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type MonitorsViewProps = {
  minutes: number;
  selectedMonitorId: number | null;
  serviceFilter: string | null;
  environmentFilter: string | null;
};

type MonitorFormState = {
  name: string;
  type: "http" | "tcp" | "dns";
  service: string;
  environment: string;
  owner: string;
  severity: "critical" | "high" | "medium" | "low";
  runbook_url: string;
  target: string;
  interval_seconds: string;
  timeout_seconds: string;
  incident_threshold: string;
  retries: string;
  http_keyword: string;
  enabled: boolean;
};

type MaintenanceFormState = {
  scope: "selected" | "global";
  starts_at: string;
  ends_at: string;
  reason: string;
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

function toLocalInputValue(date: Date) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function defaultMaintenanceForm(): MaintenanceFormState {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  return {
    scope: "selected",
    starts_at: toLocalInputValue(startsAt),
    ends_at: toLocalInputValue(endsAt),
    reason: "",
  };
}

function defaultMonitorForm(): MonitorFormState {
  return {
    name: "",
    type: "http",
    service: "",
    environment: "prod",
    owner: "",
    severity: "medium",
    runbook_url: "",
    target: "",
    interval_seconds: "60",
    timeout_seconds: "5",
    incident_threshold: "3",
    retries: "0",
    http_keyword: "",
    enabled: true,
  };
}

function monitorToFormState(monitor: Monitor): MonitorFormState {
  return {
    name: monitor.name,
    type: monitor.type as MonitorFormState["type"],
    service: monitor.service,
    environment: monitor.environment,
    owner: monitor.owner,
    severity: monitor.severity,
    runbook_url: monitor.runbook_url ?? "",
    target: monitor.target,
    interval_seconds: String(monitor.interval_seconds),
    timeout_seconds: String(monitor.timeout_seconds),
    incident_threshold: String(monitor.incident_threshold),
    retries: String(monitor.retries),
    http_keyword: monitor.http_keyword ?? "",
    enabled: monitor.enabled,
  };
}

function buildMonitorPath(
  minutes: number,
  monitorId: number | null,
  serviceFilter: string | null,
  environmentFilter: string | null,
) {
  const params = new URLSearchParams({ minutes: String(minutes) });
  if (monitorId != null) {
    params.set("monitor", String(monitorId));
  }
  if (serviceFilter) {
    params.set("service", serviceFilter);
  }
  if (environmentFilter) {
    params.set("environment", environmentFilter);
  }
  return `/monitors?${params.toString()}`;
}

function parseMonitorPayload(form: MonitorFormState) {
  return {
    name: form.name.trim(),
    type: form.type,
    service: form.service.trim(),
    environment: form.environment.trim(),
    owner: form.owner.trim(),
    severity: form.severity,
    runbook_url: form.runbook_url.trim() || null,
    target: form.target.trim(),
    interval_seconds: Number(form.interval_seconds),
    timeout_seconds: Number(form.timeout_seconds),
    incident_threshold: Number(form.incident_threshold),
    retries: Number(form.retries),
    http_keyword: form.http_keyword.trim() || null,
    enabled: form.enabled,
  };
}

export function MonitorsView({
  minutes,
  selectedMonitorId,
  serviceFilter,
  environmentFilter,
}: MonitorsViewProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canOperate = hasRole(currentUser.role, ["programmer", "admin"]);
  const canAdmin = currentUser.role === "admin";

  const overviewQuery = useApiQuery(`/opswatch-api/api/stats/overview?minutes=${minutes}`, overviewSchema);
  const maintenanceQuery = useApiQuery("/opswatch-api/api/maintenance", maintenanceSchemaOut.array());

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
  const monitorDetailQuery = useApiQuery(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}` : null,
    monitorSchema,
  );
  const runsQuery = useApiQuery(
    activeMonitor ? `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/runs?limit=20` : null,
    checkRunSchema.array(),
  );

  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>(defaultMaintenanceForm());
  const [adminMode, setAdminMode] = useState<"edit" | "create">("edit");
  const [monitorForm, setMonitorForm] = useState<MonitorFormState>(defaultMonitorForm());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (monitorDetailQuery.data && adminMode === "edit") {
      setMonitorForm(monitorToFormState(monitorDetailQuery.data));
    }
  }, [adminMode, monitorDetailQuery.data]);

  const maintenanceWindows = useMemo(() => {
    if (!activeMonitor) {
      return [];
    }
    return (maintenanceQuery.data ?? []).filter(
      (window) => window.monitor_id == null || window.monitor_id == activeMonitor.monitor.id,
    );
  }, [activeMonitor, maintenanceQuery.data]);

  async function refreshDetail() {
    await Promise.all([
      overviewQuery.mutate(),
      monitorDetailQuery.mutate(),
      statsQuery.mutate(),
      runsQuery.mutate(),
      maintenanceQuery.mutate(),
    ]);
  }

  async function runMonitorNow() {
    if (!activeMonitor) {
      return;
    }

    setBusyAction("run");
    setActionError(null);
    setActionNotice(null);
    try {
      const res = await apiRequest(
        `/opswatch-api/api/monitors/${activeMonitor.monitor.id}/run`,
        { method: "POST" },
        { csrf: true },
      );
      const payload = (await res.json()) as { job_id: string };
      setActionNotice(`Manual run queued as ${payload.job_id}.`);
      await refreshDetail();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to enqueue manual run");
    } finally {
      setBusyAction(null);
    }
  }

  async function createMaintenanceWindow() {
    if (!activeMonitor) {
      return;
    }

    setBusyAction("maintenance-create");
    setActionError(null);
    setActionNotice(null);
    try {
      await apiRequest(
        "/opswatch-api/api/maintenance",
        {
          method: "POST",
          body: JSON.stringify({
            monitor_id: maintenanceForm.scope === "global" ? null : activeMonitor.monitor.id,
            starts_at: new Date(maintenanceForm.starts_at).toISOString(),
            ends_at: new Date(maintenanceForm.ends_at).toISOString(),
            reason: maintenanceForm.reason.trim() || null,
          }),
        },
        { csrf: true },
      );
      setMaintenanceForm(defaultMaintenanceForm());
      setActionNotice("Maintenance window created.");
      await refreshDetail();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to create maintenance window");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteMaintenanceWindow(windowId: number) {
    setBusyAction(`maintenance-delete-${windowId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      await apiRequest(`/opswatch-api/api/maintenance/${windowId}`, { method: "DELETE" }, { csrf: true });
      setActionNotice("Maintenance window deleted.");
      await refreshDetail();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete maintenance window");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMonitor() {
    if (!activeMonitor && adminMode === "edit") {
      return;
    }

    setBusyAction("monitor-save");
    setActionError(null);
    setActionNotice(null);

    try {
      const payload = parseMonitorPayload(monitorForm);
      if (adminMode === "create") {
        const res = await apiRequest(
          "/opswatch-api/api/monitors",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          { csrf: true },
        );
        const createdMonitor = monitorSchema.parse(await res.json());
        setActionNotice(`Created monitor ${createdMonitor.name}.`);
        await overviewQuery.mutate();
        router.replace(buildMonitorPath(minutes, createdMonitor.id, serviceFilter, environmentFilter));
        setAdminMode("edit");
      } else if (activeMonitor) {
        await apiRequest(
          `/opswatch-api/api/monitors/${activeMonitor.monitor.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
          { csrf: true },
        );
        setActionNotice(`Updated monitor ${activeMonitor.monitor.name}.`);
        await refreshDetail();
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to save monitor");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteSelectedMonitor() {
    if (!activeMonitor || !window.confirm(`Delete monitor ${activeMonitor.monitor.name}?`)) {
      return;
    }

    setBusyAction("monitor-delete");
    setActionError(null);
    setActionNotice(null);
    try {
      await apiRequest(
        `/opswatch-api/api/monitors/${activeMonitor.monitor.id}`,
        { method: "DELETE" },
        { csrf: true },
      );
      setActionNotice(`Deleted monitor ${activeMonitor.monitor.name}.`);
      const nextOverview = await overviewQuery.mutate();
      const nextMonitorId = nextOverview?.monitors?.[0]?.monitor?.id ?? null;
      router.replace(buildMonitorPath(minutes, nextMonitorId, serviceFilter, environmentFilter));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete monitor");
    } finally {
      setBusyAction(null);
    }
  }

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

  const detailError = firstError(statsQuery.error, runsQuery.error, maintenanceQuery.error, monitorDetailQuery.error);

  return (
    <div className="ow-page" data-testid="monitors-view">
      <PageHeader
        title="Monitors"
        description="Ownership-aware fleet view with selected-monitor drilldown and operator controls."
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
            <RefreshButton
              onRefresh={() =>
                Promise.all([
                  overviewQuery.mutate(),
                  monitorDetailQuery.mutate(),
                  statsQuery.mutate(),
                  runsQuery.mutate(),
                  maintenanceQuery.mutate(),
                ])
              }
            />
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

          {canOperate ? (
            <Panel className="space-y-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="ow-section-title">Operator actions</p>
                  <p className="ow-section-subtitle">Programmers and admins can run checks and manage maintenance.</p>
                </div>
                <button type="button" className="ow-btn-primary" onClick={runMonitorNow} disabled={busyAction != null}>
                  {busyAction === "run" ? "Queueing..." : "Run now"}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="ow-field-label">
                  Scope
                  <select
                    className="ow-input"
                    value={maintenanceForm.scope}
                    onChange={(event) =>
                      setMaintenanceForm((current) => ({
                        ...current,
                        scope: event.target.value as MaintenanceFormState["scope"],
                      }))
                    }
                  >
                    <option value="selected">Selected monitor</option>
                    <option value="global">Global</option>
                  </select>
                </label>
                <label className="ow-field-label">
                  Reason
                  <input
                    className="ow-input"
                    value={maintenanceForm.reason}
                    onChange={(event) =>
                      setMaintenanceForm((current) => ({ ...current, reason: event.target.value }))
                    }
                    placeholder="planned deploy"
                  />
                </label>
                <label className="ow-field-label">
                  Starts at
                  <input
                    type="datetime-local"
                    className="ow-input"
                    value={maintenanceForm.starts_at}
                    onChange={(event) =>
                      setMaintenanceForm((current) => ({ ...current, starts_at: event.target.value }))
                    }
                  />
                </label>
                <label className="ow-field-label">
                  Ends at
                  <input
                    type="datetime-local"
                    className="ow-input"
                    value={maintenanceForm.ends_at}
                    onChange={(event) =>
                      setMaintenanceForm((current) => ({ ...current, ends_at: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="ow-btn-secondary"
                onClick={createMaintenanceWindow}
                disabled={busyAction != null}
              >
                {busyAction === "maintenance-create" ? "Saving..." : "Create maintenance window"}
              </button>
            </Panel>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs uppercase tracking-[0.14em] text-slate-400">Maintenance windows</h4>
              <span className="text-xs text-slate-500">Create/delete only in 0.3.0</span>
            </div>
            {maintenanceWindows.length == 0 ? (
              <p className="mt-2 text-xs text-slate-500">No global or monitor-specific windows recorded.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {maintenanceWindows.slice(0, 8).map((window) => (
                  <Panel key={window.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs text-slate-300">
                    <div>
                      <p className="font-medium text-slate-100">
                        {window.monitor_id == null ? "Global" : `Monitor ${window.monitor_id}`} window
                      </p>
                      <p className="mt-1">
                        {formatDate(window.starts_at)} to {formatDate(window.ends_at)}
                      </p>
                      <p className="mt-1 text-slate-400">{window.reason ?? "No reason provided"}</p>
                    </div>
                    {canOperate ? (
                      <button
                        type="button"
                        className="ow-btn-secondary"
                        onClick={() => deleteMaintenanceWindow(window.id)}
                        disabled={busyAction != null}
                      >
                        {busyAction === `maintenance-delete-${window.id}` ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </Panel>
                ))}
              </div>
            )}
          </div>

          {detailError ? <ErrorState message={String(detailError)} /> : null}
          {actionError ? <p className="text-xs text-rose-300">{actionError}</p> : null}
          {actionNotice ? <p className="text-xs text-emerald-300">{actionNotice}</p> : null}

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

          {canAdmin ? (
            <Panel className="space-y-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="ow-section-title">Admin monitor management</p>
                  <p className="ow-section-subtitle">Create, update, or delete monitors from the selected detail view.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`ow-btn-toggle ${adminMode === "edit" ? "ow-btn-toggle-active" : "ow-btn-toggle-inactive"}`}
                    onClick={() => {
                      setAdminMode("edit");
                      if (monitorDetailQuery.data) {
                        setMonitorForm(monitorToFormState(monitorDetailQuery.data));
                      }
                    }}
                  >
                    Edit selected
                  </button>
                  <button
                    type="button"
                    className={`ow-btn-toggle ${adminMode === "create" ? "ow-btn-toggle-active" : "ow-btn-toggle-inactive"}`}
                    onClick={() => {
                      setAdminMode("create");
                      setMonitorForm(defaultMonitorForm());
                    }}
                  >
                    New monitor
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="ow-field-label">
                  Name
                  <input className="ow-input" value={monitorForm.name} onChange={(event) => setMonitorForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Type
                  <select
                    className="ow-input"
                    value={monitorForm.type}
                    onChange={(event) => setMonitorForm((current) => ({ ...current, type: event.target.value as MonitorFormState["type"] }))}
                  >
                    <option value="http">http</option>
                    <option value="tcp">tcp</option>
                    <option value="dns">dns</option>
                  </select>
                </label>
                <label className="ow-field-label">
                  Service
                  <input className="ow-input" value={monitorForm.service} onChange={(event) => setMonitorForm((current) => ({ ...current, service: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Environment
                  <input className="ow-input" value={monitorForm.environment} onChange={(event) => setMonitorForm((current) => ({ ...current, environment: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Owner
                  <input className="ow-input" value={monitorForm.owner} onChange={(event) => setMonitorForm((current) => ({ ...current, owner: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Severity
                  <select
                    className="ow-input"
                    value={monitorForm.severity}
                    onChange={(event) => setMonitorForm((current) => ({ ...current, severity: event.target.value as MonitorFormState["severity"] }))}
                  >
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </label>
                <label className="ow-field-label md:col-span-2">
                  Target
                  <input className="ow-input" value={monitorForm.target} onChange={(event) => setMonitorForm((current) => ({ ...current, target: event.target.value }))} />
                </label>
                <label className="ow-field-label md:col-span-2">
                  Runbook URL
                  <input
                    className="ow-input"
                    value={monitorForm.runbook_url}
                    onChange={(event) => setMonitorForm((current) => ({ ...current, runbook_url: event.target.value }))}
                  />
                </label>
                <label className="ow-field-label">
                  Interval seconds
                  <input className="ow-input" type="number" value={monitorForm.interval_seconds} onChange={(event) => setMonitorForm((current) => ({ ...current, interval_seconds: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Timeout seconds
                  <input className="ow-input" type="number" value={monitorForm.timeout_seconds} onChange={(event) => setMonitorForm((current) => ({ ...current, timeout_seconds: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Incident threshold
                  <input className="ow-input" type="number" value={monitorForm.incident_threshold} onChange={(event) => setMonitorForm((current) => ({ ...current, incident_threshold: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Retries
                  <input className="ow-input" type="number" value={monitorForm.retries} onChange={(event) => setMonitorForm((current) => ({ ...current, retries: event.target.value }))} />
                </label>
                <label className="ow-field-label md:col-span-2">
                  HTTP keyword
                  <input className="ow-input" value={monitorForm.http_keyword} onChange={(event) => setMonitorForm((current) => ({ ...current, http_keyword: event.target.value }))} />
                </label>
                <label className="ow-field-label">
                  Enabled
                  <select
                    className="ow-input"
                    value={monitorForm.enabled ? "true" : "false"}
                    onChange={(event) => setMonitorForm((current) => ({ ...current, enabled: event.target.value === "true" }))}
                  >
                    <option value="true">enabled</option>
                    <option value="false">disabled</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="ow-btn-primary" onClick={saveMonitor} disabled={busyAction != null}>
                  {busyAction === "monitor-save"
                    ? adminMode === "create"
                      ? "Creating..."
                      : "Saving..."
                    : adminMode === "create"
                      ? "Create monitor"
                      : "Save changes"}
                </button>
                {adminMode === "edit" ? (
                  <button
                    type="button"
                    className="ow-btn-secondary"
                    onClick={deleteSelectedMonitor}
                    disabled={busyAction != null}
                  >
                    {busyAction === "monitor-delete" ? "Deleting..." : "Delete monitor"}
                  </button>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
