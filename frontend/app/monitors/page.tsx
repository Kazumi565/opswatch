import { MonitorsView } from "@/views/monitors-view";

function parseMinutes(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "60");
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.min(10080, Math.max(5, Math.floor(parsed)));
}

function parseOptionalMonitor(value: string | string[] | undefined): number | null {
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

function parseFilter(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw == "all") {
    return null;
  }
  return raw;
}

export default async function MonitorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const minutes = parseMinutes(params.minutes);
  const selectedMonitorId = parseOptionalMonitor(params.monitor);
  const serviceFilter = parseFilter(params.service);
  const environmentFilter = parseFilter(params.environment);

  return (
    <MonitorsView
      minutes={minutes}
      selectedMonitorId={selectedMonitorId}
      serviceFilter={serviceFilter}
      environmentFilter={environmentFilter}
    />
  );
}
