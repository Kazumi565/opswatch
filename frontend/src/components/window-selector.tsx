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
            className={`ow-btn-toggle ${active ? "ow-btn-toggle-active" : "ow-btn-toggle-inactive"}`}
          >
            {value >= 60 ? `${value / 60}h` : `${value}m`}
          </Link>
        );
      })}
    </div>
  );
}