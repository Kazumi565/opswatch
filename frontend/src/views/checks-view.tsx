"use client";

import useSWR from "swr";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { formatDate, formatDurationMs } from "@/lib/format";
import { fetchAndParse } from "@/lib/http";
import { checkRunSchema, monitorSchema } from "@/lib/schemas";

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

export function ChecksView({ success, monitorId, limit }: ChecksViewProps) {
  const monitorsQuery = useSWR("/opswatch-api/api/monitors", (path: string) => fetchAndParse(path, monitorSchema.array()), {
    refreshInterval: 30_000,
  });

  const runsPath = buildRunsPath(success, monitorId, limit);

  const runsQuery = useSWR(runsPath, (path: string) => fetchAndParse(path, checkRunSchema.array()), {
    refreshInterval: 30_000,
  });

  if ((monitorsQuery.isLoading && !monitorsQuery.data) || (runsQuery.isLoading && !runsQuery.data)) {
    return <LoadingState message="Loading checks feed..." />;
  }

  if (monitorsQuery.error || runsQuery.error) {
    return <ErrorState message={String(monitorsQuery.error ?? runsQuery.error)} />;
  }

  const monitors = monitorsQuery.data ?? [];
  const monitorNames = new Map(monitors.map((item) => [item.id, item.name]));
  const runs = runsQuery.data ?? [];

  return (
    <div className="space-y-5" data-testid="checks-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Checks</h2>
        <button
          type="button"
          onClick={() => Promise.all([monitorsQuery.mutate(), runsQuery.mutate()])}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:border-white/50"
        >
          Refresh now
        </button>
      </div>

      <form action="/checks" method="get" className="grid gap-3 rounded-xl border border-white/10 bg-slate-900/45 p-4 md:grid-cols-4">
        <label className="text-sm text-slate-300">
          Success
          <select
            name="success"
            defaultValue={success}
            className="mt-1 w-full rounded-md border border-white/20 bg-slate-950/60 px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="true">Success only</option>
            <option value="false">Failures only</option>
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Monitor
          <select
            name="monitor"
            defaultValue={monitorId == null ? "all" : String(monitorId)}
            className="mt-1 w-full rounded-md border border-white/20 bg-slate-950/60 px-2 py-1.5 text-sm"
          >
            <option value="all">All monitors</option>
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Limit
          <input
            name="limit"
            type="number"
            min={1}
            max={500}
            defaultValue={limit}
            className="mt-1 w-full rounded-md border border-white/20 bg-slate-950/60 px-2 py-1.5 text-sm"
          />
        </label>

        <div className="flex items-end">
          <button type="submit" className="w-full rounded-md border border-accent/50 bg-accent/20 px-3 py-2 text-sm text-accent">
            Apply filters
          </button>
        </div>
      </form>

      {runs.length == 0 ? (
        <EmptyState message="No check runs for the selected filters." />
      ) : (
        <section className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-3 py-3">Run</th>
                <th className="px-3 py-3">Monitor</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Started</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-3 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="bg-slate-950/30">
                  <td className="px-3 py-3 font-medium text-slate-200">#{run.id}</td>
                  <td className="px-3 py-3 text-slate-300">{monitorNames.get(run.monitor_id) ?? `Monitor ${run.monitor_id}`}</td>
                  <td className="px-3 py-3 text-slate-200">{run.success ? "success" : "failure"}</td>
                  <td className="px-3 py-3 text-slate-300">{formatDate(run.started_at)}</td>
                  <td className="px-3 py-3 text-slate-300">{formatDurationMs(run.duration_ms)}</td>
                  <td className="px-3 py-3 text-rose-300">{run.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

