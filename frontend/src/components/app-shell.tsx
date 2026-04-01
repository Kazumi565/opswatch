"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import { AuthProvider } from "@/lib/auth";
import { apiRequest } from "@/lib/http";
import type { AuthMe } from "@/lib/schemas";
import { DEFAULT_REFRESH_MS } from "@/lib/use-api-query";

type AppShellProps = PropsWithChildren<{
  currentUser: AuthMe;
}>;

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

function currentUserLabel(currentUser: AuthMe) {
  return `${currentUser.display_name} (${currentUser.role})`;
}

function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" }, { csrf: true });
      router.replace("/login");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button type="button" className="ow-btn-secondary" onClick={handleLogout} disabled={submitting}>
      {submitting ? "Signing out..." : "Logout"}
    </button>
  );
}

export function AppShell({ currentUser, children }: AppShellProps) {
  const pathname = usePathname();
  const refreshSeconds = Math.round(DEFAULT_REFRESH_MS / 1000);
  const navItems = [
    { href: "/overview", label: "Overview", visible: true },
    { href: "/monitors", label: "Monitors", visible: true },
    { href: "/incidents", label: "Incidents", visible: true },
    { href: "/checks", label: "Checks", visible: true },
    { href: "/profile", label: "Profile", visible: true },
    { href: "/users", label: "Users", visible: currentUser.role === "admin" },
    { href: "/audit", label: "Audit", visible: currentUser.role === "admin" },
  ].filter((item) => item.visible);

  return (
    <AuthProvider currentUser={currentUser}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f2937,_#0a0f14_55%)] text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-6 px-4 py-6 md:px-8">
          <aside className="hidden w-64 shrink-0 rounded-2xl border border-white/10 bg-panel/85 p-5 shadow-panel md:block">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">OpsWatch</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-accent">Control Surface</h1>
            <p className="mt-2 text-xs text-slate-400">
              Role-aware operations workspace for incidents, maintenance, and control-plane actions.
            </p>
            <nav className="mt-8 space-y-2">
              {navItems.map((item) => {
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
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Operations Dashboard</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Signed in as {currentUserLabel(currentUser)} with API polling every {refreshSeconds}s
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{currentUser.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
                    {currentUser.role}
                  </div>
                  <LogoutButton />
                </div>
              </div>

              <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:hidden">
                {navItems.map((item) => {
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
    </AuthProvider>
  );
}
