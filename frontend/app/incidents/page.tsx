import { IncidentsView } from "@/views/incidents-view";

function parseScope(value: string | string[] | undefined): "open" | "all" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == "all" ? "all" : "open";
}

function parseOptionalIncident(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  const selectedIncidentId = parseOptionalIncident(params.incident);
  return <IncidentsView scope={scope} selectedIncidentId={selectedIncidentId} />;
}
