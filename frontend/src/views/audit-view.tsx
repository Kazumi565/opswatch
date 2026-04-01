"use client";

import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { formatDate } from "@/lib/format";
import { auditEventSchema } from "@/lib/schemas";
import { useApiQuery } from "@/lib/use-api-query";

function buildAuditPath(resourceType: string, resourceId: string) {
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (resourceType.trim()) {
    params.set("resource_type", resourceType.trim());
  }
  if (resourceId.trim()) {
    params.set("resource_id", resourceId.trim());
  }
  return `/opswatch-api/api/audit?${params.toString()}`;
}

export function AuditView() {
  const [resourceType, setResourceType] = useState("");
  const [resourceId, setResourceId] = useState("");
  const query = useApiQuery(buildAuditPath(resourceType, resourceId), auditEventSchema.array());

  if (query.isLoading && !query.data) {
    return <LoadingState message="Loading audit events..." />;
  }

  if (query.error) {
    return <ErrorState message={String(query.error)} />;
  }

  const rows = query.data ?? [];

  return (
    <div className="ow-page" data-testid="audit-view">
      <PageHeader
        title="Audit"
        description="Compact control-plane history for auth, maintenance, monitor, and user changes."
        actions={<RefreshButton onRefresh={() => query.mutate()} />}
      />

      <form className="grid gap-3 ow-panel p-4 md:grid-cols-3" onSubmit={(event) => event.preventDefault()}>
        <label className="ow-field-label">
          Resource type
          <input
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            className="ow-input"
            placeholder="monitor"
          />
        </label>
        <label className="ow-field-label">
          Resource id
          <input
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            className="ow-input"
            placeholder="12"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="ow-btn-secondary w-full"
            onClick={() => {
              setResourceType("");
              setResourceId("");
            }}
          >
            Reset filters
          </button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState message="No audit events matched the current filters." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Panel key={row.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-100">{row.action}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {row.resource_type} #{row.resource_id} by {row.actor}
                  </p>
                </div>
                <p className="text-xs text-slate-400">{formatDate(row.created_at)}</p>
              </div>
              <pre className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                {JSON.stringify(row.summary_json, null, 2)}
              </pre>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
