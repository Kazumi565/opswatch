type Status = "up" | "down" | "degraded" | "maintenance" | "unknown";

const STYLES: Record<Status, string> = {
  up: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  down: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  degraded: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  maintenance: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  unknown: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {status}
    </span>
  );
}
