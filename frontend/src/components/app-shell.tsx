"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/monitors", label: "Monitors" },
  { href: "/incidents", label: "Incidents" },
  { href: "/checks", label: "Checks" },
];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f2937,_#0a0f14_55%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-60 shrink-0 rounded-2xl border border-white/10 bg-panel/85 p-5 shadow-panel md:block">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">OpsWatch</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-accent">Control Surface</h1>
          <nav className="mt-8 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "bg-accent/20 text-accent"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 rounded-2xl border border-white/10 bg-panel/75 p-4 shadow-panel md:p-6">
          <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Operations Dashboard</p>
              <p className="mt-1 text-sm text-slate-300">Read-only incident and service health view</p>
            </div>
            <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
              Auto refresh: 30s
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
