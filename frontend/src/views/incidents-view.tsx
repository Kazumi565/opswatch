"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { formatDate } from "@/lib/format";
import { incidentSchema } from "@/lib/schemas";
import { useApiQuery } from "@/lib/use-api-query";

type IncidentsViewProps = {
  scope: "open" | "all";
};

function incidentStatusClass(status: string): string {
  if (status == "open") {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (status == "resolved") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  return "border-slate-500/40 bg-slate-500/15 text-slate-300";
}

export function IncidentsView({ scope }: IncidentsViewProps) {
  const endpoint = scope == "open" ? "/api/incidents/open?limit=200" : "/api/incidents?limit=200";

  const incidentsQuery = useApiQuery(endpoint, incidentSchema.array());

  if (incidentsQuery.isLoading && !incidentsQuery.data) {
    return <LoadingState message="Loading incidents..." />;
  }

  if (incidentsQuery.error) {
    return <ErrorState message={String(incidentsQuery.error)} />;
  }

  const incidents = incidentsQuery.data ?? [];

  return (
    <div className="space-y-5" data-testid="incidents-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Incidents</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/incidents?scope=open"
            className={`rounded-md border px-3 py-1.5 text-xs ${
              scope == "open" ? "border-accent/60 bg-accent/20 text-accent" : "border-white/20 hover:border-white/50"
            }`}
          >
            Open
          </Link>
          <Link
            href="/incidents?scope=all"
            className={`rounded-md border px-3 py-1.5 text-xs ${
              scope == "all" ? "border-accent/60 bg-accent/20 text-accent" : "border-white/20 hover:border-white/50"
            }`}
          >
            All
          </Link>
          <button
            type="button"
            onClick={() => incidentsQuery.mutate()}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:border-white/50"
          >
            Refresh now
          </button>
        </div>
      </div>

      {incidents.length == 0 ? (
        <EmptyState message="No incidents found for the selected scope." />
      ) : (
        <section className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Incident</th>
                <th className="px-3 py-3">Monitor</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Opened</th>
                <th className="px-3 py-3">Resolved</th>
                <th className="px-3 py-3">Last error</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const monitorName = incident.monitor_name ?? `Monitor ${incident.monitor_id}`;
                return (
                  <tr key={incident.id} className="bg-slate-950/30">
                    <td className="px-3 py-3 font-medium text-slate-200">#{incident.id}</td>
                    <td className="px-3 py-3 text-slate-300">
                      <p className="font-medium text-slate-200">{monitorName}</p>
                      <p className="text-xs text-slate-400">ID {incident.monitor_id}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-200">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${incidentStatusClass(incident.status)}`}>
                        {incident.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{formatDate(incident.opened_at)}</td>
                    <td className="px-3 py-3 text-slate-300">{formatDate(incident.resolved_at)}</td>
                    <td className="max-w-80 px-3 py-3 text-rose-300"><span className="block truncate" title={incident.last_error ?? ""}>{incident.last_error ?? "-"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
