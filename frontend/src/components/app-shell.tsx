"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

import { DEFAULT_REFRESH_MS } from "@/lib/use-api-query";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/monitors", label: "Monitors" },
  { href: "/incidents", label: "Incidents" },
  { href: "/checks", label: "Checks" },
];

function navItemClass(active: boolean, compact = false): string {
  if (compact) {
    return `rounded-md border px-3 py-1.5 text-center text-xs transition ${
      active
        ? "border-accent/70 bg-accent/20 text-accent"
        : "border-white/15 text-slate-300 hover:border-white/40 hover:text-white"
    }`;
  }

  return `block rounded-lg px-3 py-2 text-sm transition ${
    active ? "bg-accent/20 text-accent" : "text-slate-300 hover:bg-white/5 hover:text-white"
  }`;
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const refreshSeconds = Math.round(DEFAULT_REFRESH_MS / 1000);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f2937,_#0a0f14_55%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-60 shrink-0 rounded-2xl border border-white/10 bg-panel/85 p-5 shadow-panel md:block">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">OpsWatch</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-accent">Control Surface</h1>
          <p className="mt-2 text-xs text-slate-400">
            Read-only operations lens for monitor health and incident response.
          </p>
          <nav className="mt-8 space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={navItemClass(active)}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 rounded-2xl border border-white/10 bg-panel/75 p-4 shadow-panel md:p-6">
          <div className="mb-5 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Operations Dashboard
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Overview first, drilldowns for monitors, incidents, and checks
                </p>
              </div>
              <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
                API polling: {refreshSeconds}s
              </div>
            </div>

            <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:hidden">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={navItemClass(active, true)}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
