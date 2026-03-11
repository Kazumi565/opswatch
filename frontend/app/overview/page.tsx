import { OverviewView } from "@/views/overview-view";

function parseMinutes(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "60");
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.min(10080, Math.max(5, Math.floor(parsed)));
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const minutes = parseMinutes(params.minutes);
  return <OverviewView minutes={minutes} />;
}
