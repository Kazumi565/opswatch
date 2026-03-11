"use client";

import Link from "next/link";
import useSWR from "swr";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { formatDate } from "@/lib/format";
import { fetchAndParse } from "@/lib/http";
import { incidentSchema } from "@/lib/schemas";

type IncidentsViewProps = {
  scope: "open" | "all";
};

export function IncidentsView({ scope }: IncidentsViewProps) {
  const endpoint = scope == "open" ? "/opswatch-api/api/incidents/open?limit=200" : "/opswatch-api/api/incidents?limit=200";

  const incidentsQuery = useSWR(endpoint, (path: string) => fetchAndParse(path, incidentSchema.array()), {
    refreshInterval: 30_000,
  });

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
        <section className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
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
              {incidents.map((incident) => (
                <tr key={incident.id} className="bg-slate-950/30">
                  <td className="px-3 py-3 font-medium text-slate-200">#{incident.id}</td>
                  <td className="px-3 py-3 text-slate-300">{incident.monitor_id}</td>
                  <td className="px-3 py-3 text-slate-200">{incident.status}</td>
                  <td className="px-3 py-3 text-slate-300">{formatDate(incident.opened_at)}</td>
                  <td className="px-3 py-3 text-slate-300">{formatDate(incident.resolved_at)}</td>
                  <td className="px-3 py-3 text-rose-300">{incident.last_error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

