import { ChecksView } from "@/views/checks-view";

function parseSuccess(value: string | string[] | undefined): "all" | "true" | "false" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == "true" || raw == "false") {
    return raw;
  }
  return "all";
}

function parseLimit(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "100");
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function parseMonitor(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw == "all") {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const success = parseSuccess(params.success);
  const monitorId = parseMonitor(params.monitor);
  const limit = parseLimit(params.limit);

  return <ChecksView success={success} monitorId={monitorId} limit={limit} />;
}
