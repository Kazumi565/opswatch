"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { StateBadge } from "@/components/state-badge";
import { runtimeSchema } from "@/lib/schemas";
import { firstError, useApiQuery } from "@/lib/use-api-query";

type RuntimeRowProps = {
  label: string;
  value: string | null;
};

function displayValue(value: string | null): string {
  const normalized = value?.trim();
  return normalized ? normalized : "not provided";
}

function RuntimeRow({ label, value }: RuntimeRowProps) {
  return (
    <div className="grid gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <dt className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</dt>
      <dd className="break-words text-sm font-medium text-slate-100">{displayValue(value)}</dd>
    </div>
  );
}

export function RuntimeView() {
  const runtimeQuery = useApiQuery("/opswatch-api/api/runtime", runtimeSchema);

  if (runtimeQuery.isLoading && !runtimeQuery.data) {
    return <LoadingState message="Loading runtime metadata..." />;
  }

  const queryError = firstError(runtimeQuery.error);
  if (queryError) {
    return <ErrorState message={String(queryError)} />;
  }

  const runtime = runtimeQuery.data;
  if (!runtime) {
    return <ErrorState message="Missing runtime metadata from API." />;
  }

  const isKubernetes = runtime.orchestrator.toLowerCase().includes("kubernetes");
  const platformTone = isKubernetes ? "ok" : "neutral";

  return (
    <div className="ow-page" data-testid="runtime-view">
      <PageHeader
        title="Runtime"
        description="Deployment identity, orchestrator metadata, and build provenance for the active OpsWatch API."
        actions={<RefreshButton onRefresh={() => runtimeQuery.mutate()} />}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <p className="ow-kpi-label">Deployment mode</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">{runtime.deployment_mode}</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Orchestrator</p>
          <div className="mt-2">
            <StateBadge label={runtime.orchestrator} tone={platformTone} />
          </div>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Cloud provider</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">{runtime.cloud_provider}</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Health</p>
          <div className="mt-2">
            <StateBadge label={runtime.health_status} tone="ok" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="p-4">
          <h3 className="ow-section-title">Kubernetes identity</h3>
          <dl className="mt-3">
            <RuntimeRow label="Namespace" value={runtime.namespace} />
            <RuntimeRow label="Pod" value={runtime.pod_name} />
            <RuntimeRow label="Node" value={runtime.node_name} />
          </dl>
        </Panel>

        <Panel className="p-4">
          <h3 className="ow-section-title">Build metadata</h3>
          <dl className="mt-3">
            <RuntimeRow label="Image tag" value={runtime.image_tag} />
            <RuntimeRow label="API version" value={runtime.version} />
            <RuntimeRow label="Commit" value={runtime.commit} />
            <RuntimeRow label="Built at" value={runtime.built_at} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}
