import Link from "next/link";

type WindowSelectorProps = {
  basePath: string;
  minutes: number;
  params?: Record<string, string | number | undefined>;
};

const OPTIONS = [15, 60, 240, 1440];

export function WindowSelector({ basePath, minutes, params = {} }: WindowSelectorProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-300">
      <span className="uppercase tracking-[0.18em] text-slate-400">Window</span>
      {OPTIONS.map((value) => {
        const active = value == minutes;
        const query = new URLSearchParams();
        query.set("minutes", String(value));
        Object.entries(params).forEach(([key, paramValue]) => {
          if (paramValue == null) {
            return;
          }
          query.set(key, String(paramValue));
        });

        return (
          <Link
            key={value}
            href={`${basePath}?${query.toString()}`}
            className={`rounded-md border px-2 py-1 transition ${
              active
                ? "border-accent/70 bg-accent/20 text-accent"
                : "border-white/15 hover:border-white/40 hover:text-white"
            }`}
          >
            {value >= 60 ? `${value / 60}h` : `${value}m`}
          </Link>
        );
      })}
    </div>
  );
}
