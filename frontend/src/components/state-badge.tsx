type StateTone = "ok" | "warning" | "error" | "neutral";

type StateBadgeProps = {
  label: string;
  tone: StateTone;
};

const STYLE_BY_TONE: Record<StateTone, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  error: "border-rose-500/40 bg-rose-500/15 text-rose-300",
  neutral: "border-slate-500/40 bg-slate-500/15 text-slate-300",
};

export function StateBadge({ label, tone }: StateBadgeProps) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE_BY_TONE[tone]}`}>{label}</span>;
}