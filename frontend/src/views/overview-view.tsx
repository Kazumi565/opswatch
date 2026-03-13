"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { StateBadge } from "@/components/state-badge";
import { StatusPill } from "@/components/status-pill";
import { WindowSelector } from "@/components/window-selector";
import { formatDate } from "@/lib/format";
import { overviewSchema, statusSchema, summarySchema, versionSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type OverviewViewProps = {
  minutes: number;
  serviceFilter: string | null;
  environmentFilter: string | null;
};

type MonitorYAxisTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
};

function trimLabel(label: string, limit = 18): string {
  return label.length > limit ? `${label.slice(0, Math.max(0, limit - 3))}...` : label;
}

function MonitorYAxisTick({ x = 0, y = 0, payload }: MonitorYAxisTickProps) {
  const fullLabel = payload?.value ?? "";

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#90a3b8" fontSize={12}>
        <title>{fullLabel}</title>
        {trimLabel(fullLabel)}
      </text>
    </g>
  );
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

function displayVersionMetadata(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (lowered == "unknown" || lowered == "dev" || lowered == "local") {
    return null;
  }

  return normalized;
}

const chartTooltipTheme = {
  contentStyle: {
    backgroundColor: "#0f172a",
    border: "1px solid rgba(148,163,184,0.35)",
    borderRadius: "0.5rem",
  },
  labelStyle: { color: "#e2e8f0", fontWeight: 600 },
  itemStyle: { color: "#e2e8f0" },
} as const;

export function OverviewView({ minutes, serviceFilter, environmentFilter }: OverviewViewProps) {
  const statusQuery = useApiQuery(`/opswatch-api/api/status?minutes=${minutes}`, statusSchema);
  const summaryQuery = useApiQuery("/opswatch-api/api/summary", summarySchema);
  const overviewQuery = useApiQuery(`/opswatch-api/api/stats/overview?minutes=${minutes}`, overviewSchema);
  const versionQuery = useApiQuery("/opswatch-api/api/version", versionSchema);

  const loading =
    statusQuery.isLoading || summaryQuery.isLoading || overviewQuery.isLoading || versionQuery.isLoading;

  if (loading && (!statusQuery.data || !summaryQuery.data || !overviewQuery.data || !versionQuery.data)) {
    return <LoadingState message="Loading overview telemetry..." />;
  }

  const queryError = firstError(statusQuery.error, summaryQuery.error, overviewQuery.error, versionQuery.error);
  if (queryError) {
    return <ErrorState message={String(queryError)} />;
  }

  const status = statusQuery.data;
  const summary = summaryQuery.data;
  const overview = overviewQuery.data;
  const version = versionQuery.data;

  if (!status || !summary || !overview || !version) {
    return <ErrorState message="Missing overview data from API." />;
  }

  const allServices = Array.from(new Set(overview.monitors.map((item) => item.monitor.service))).sort();
  const allEnvironments = Array.from(new Set(overview.monitors.map((item) => item.monitor.environment))).sort();

  const filteredMonitors = overview.monitors.filter((item) => {
    if (serviceFilter && item.monitor.service != serviceFilter) {
      return false;
    }
    if (environmentFilter && item.monitor.environment != environmentFilter) {
      return false;
    }
    return true;
  });

  const filteredOpenIncidents = status.open_incidents.filter((incident) => {
    if (serviceFilter && incident.service != serviceFilter) {
      return false;
    }
    if (environmentFilter && incident.environment != environmentFilter) {
      return false;
    }
    return true;
  });

  const statusBuckets = {
    up: 0,
    down: 0,
    maintenance: 0,
    unknown: 0,
  };
  filteredMonitors.forEach((monitor) => {
    statusBuckets[monitor.status] += 1;
  });

  const statusChartData = ["up", "down", "maintenance", "unknown"].map((statusName) => ({
    status: statusName,
    count: statusBuckets[statusName as keyof typeof statusBuckets],
  }));

  const latencyChartData = filteredMonitors
    .map((item) => ({
      monitor: item.monitor.name,
      p95: item.latency_ms.p95 ?? 0,
    }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 10);

  const serviceGroups = Array.from(
    filteredMonitors.reduce(
      (acc, item) => {
        const current = acc.get(item.monitor.service) ?? {
          service: item.monitor.service,
          total: 0,
          down: 0,
          maintenance: 0,
        };
        current.total += 1;
        if (item.status == "down") {
          current.down += 1;
        }
        if (item.maintenance.active) {
          current.maintenance += 1;
        }
        acc.set(item.monitor.service, current);
        return acc;
      },
      new Map<string, { service: string; total: number; down: number; maintenance: number }>(),
    ).values(),
  ).sort((a, b) => a.service.localeCompare(b.service));

  const maintenanceCount = filteredMonitors.filter((item) => item.maintenance.active).length;
  const actionableOpenCount = summary.incidents.open_actionable;
  const totalOpenCount = summary.incidents.open_total;
  const maintenanceSuppressedCount = Math.max(0, totalOpenCount - actionableOpenCount);
  const versionParts = [`API version ${version.version}`];
  const commitLabel = displayVersionMetadata(version.commit);
  const builtLabel = displayVersionMetadata(version.built_at);

  if (commitLabel) {
    versionParts.push(`commit ${commitLabel}`);
  }
  if (builtLabel) {
    versionParts.push(`built ${builtLabel}`);
  }

  const riskState =
    actionableOpenCount > 0
      ? {
          label: "Active incidents",
          tone: "error" as const,
          message: `${actionableOpenCount} fleet-level actionable incident(s) require attention`,
        }
      : status.overall === "degraded"
        ? {
            label: "Maintenance impact",
            tone: "warning" as const,
            message: "No fleet-level active incidents; current degradation is maintenance-related",
          }
        : {
            label: "Stable",
            tone: "ok" as const,
            message: "No fleet-level active incident-derived risk signals",
          };

  return (
    <div className="ow-page" data-testid="overview-view">
      <PageHeader
        title="Overview"
        description="Primary operational snapshot with fleet health, ownership context, and filtered service groupings."
        actions={
          <>
            <WindowSelector
              basePath="/overview"
              minutes={minutes}
              params={{
                service: serviceFilter ?? undefined,
                environment: environmentFilter ?? undefined,
              }}
            />
            <RefreshButton
              onRefresh={() =>
                Promise.all([statusQuery.mutate(), summaryQuery.mutate(), overviewQuery.mutate(), versionQuery.mutate()])
              }
            />
          </>
        }
      />

      <form action="/overview" method="get" className="grid gap-3 ow-panel p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <input type="hidden" name="minutes" value={minutes} />
        <label className="ow-field-label">
          Service
          <select name="service" defaultValue={serviceFilter ?? "all"} className="ow-input">
            <option value="all">All services</option>
            {allServices.map((service) => (
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
            {allEnvironments.map((environment) => (
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
          <Link href={`/overview?minutes=${minutes}`} className="ow-btn-secondary w-full text-center">
            Reset
          </Link>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="ow-kpi-label">Overall status</p>
          <div className="mt-2">
            <StatusPill status={status.overall} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Fleet window: last {minutes} minute(s)</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Monitors enabled</p>
          <p className="ow-kpi-value">
            {summary.monitors.enabled}
            <span className="ow-kpi-meta">/ {summary.monitors.total}</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Showing {filteredMonitors.length} monitor(s) in the current ownership filter
          </p>
        </Panel>

        <Panel className={`p-4 ${actionableOpenCount > 0 ? "border-rose-500/30" : ""}`}>
          <p className="ow-kpi-label">Actionable incidents</p>
          <p className="ow-kpi-value text-rose-300">{actionableOpenCount}</p>
          <p className="mt-1 text-xs text-slate-400">
            {maintenanceSuppressedCount > 0
              ? `${totalOpenCount} total open, ${maintenanceSuppressedCount} covered by maintenance`
              : totalOpenCount > 0
                ? `${totalOpenCount} total open incident(s)`
                : "No unresolved incidents"}
          </p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Filtered maintenance</p>
          <p className="ow-kpi-value text-indigo-300">{maintenanceCount}</p>
          <p className="mt-1 text-xs text-slate-400">
            {filteredOpenIncidents.length} filtered active incident(s) visible in this slice
          </p>
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ow-kpi-label">Current risk signal</p>
            <p className="mt-2 text-sm text-slate-200">{riskState.message}</p>
          </div>
          <StateBadge label={riskState.label} tone={riskState.tone} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h3 className="ow-section-title">Monitor status distribution</h3>
          <p className="ow-section-subtitle">Filtered health buckets in the selected window</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis dataKey="status" stroke="#90a3b8" />
                <YAxis allowDecimals={false} stroke="#90a3b8" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} {...chartTooltipTheme} />
                <Bar dataKey="count" fill="#2ad0a9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-4">
          <h3 className="ow-section-title">Top monitor p95 latency (ms)</h3>
          <p className="ow-section-subtitle">Highest p95 monitors in the filtered slice</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={latencyChartData} margin={{ left: 8, right: 18 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#243244" />
                <XAxis type="number" stroke="#90a3b8" />
                <YAxis dataKey="monitor" type="category" width={120} stroke="#90a3b8" tick={<MonitorYAxisTick />} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  {...chartTooltipTheme}
                  formatter={(value) => [`${value} ms`, "p95"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.monitor ?? ""}
                />
                <Bar dataKey="p95" fill="#f4c95d" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="ow-section-title">Service ownership groups</h3>
            <p className="text-xs text-slate-400">Filtered by service/environment selectors</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {serviceGroups.map((group) => (
              <div key={group.service} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-100">{group.service}</p>
                  <StateBadge
                    label={`${group.total} monitor${group.total == 1 ? "" : "s"}`}
                    tone={group.down > 0 ? "error" : "ok"}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Down: {group.down} | Maintenance: {group.maintenance}
                </p>
              </div>
            ))}
            {serviceGroups.length === 0 && (
              <p className="text-sm text-slate-400">No monitors match the current filters.</p>
            )}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="ow-section-title">Filtered active incidents</h3>
            <p className="text-xs text-slate-400">Generated: {formatDate(status.generated_at)}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {filteredOpenIncidents.slice(0, 5).map((incident) => (
              <li key={incident.id} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-rose-300">Incident #{incident.id}</span>
                    <StateBadge label={incident.state} tone={incidentTone(incident.state)} />
                  </div>
                  <span className="text-xs text-slate-400">
                    {incident.monitor_name ?? `Monitor ${incident.monitor_id}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {incident.service} / {incident.environment} / {incident.owner}
                </p>
                <p className="mt-1 text-xs text-slate-400">Opened {formatDate(incident.opened_at)}</p>
                <p className="mt-1 text-xs text-rose-200/90">Last error: {incident.last_error ?? "-"}</p>
              </li>
            ))}
            {filteredOpenIncidents.length === 0 && (
              <li className="text-slate-400">No active incidents in the current filter slice.</li>
            )}
          </ul>
        </Panel>
      </div>

      <footer className="text-xs text-slate-500">{versionParts.join(" | ")}</footer>
    </div>
  );
}
