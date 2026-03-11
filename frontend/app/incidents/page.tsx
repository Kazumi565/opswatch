import { IncidentsView } from "@/views/incidents-view";

function parseScope(value: string | string[] | undefined): "open" | "all" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == "all" ? "all" : "open";
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scope = parseScope(params.scope);
  return <IncidentsView scope={scope} />;
}
