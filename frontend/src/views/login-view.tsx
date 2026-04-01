"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest, ApiError } from "@/lib/http";

function safeNextPath(nextPath: string | null | undefined) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/overview";
  }
  return nextPath;
}

export function LoginView({ nextPath }: Readonly<{ nextPath: string | null }>) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace(safeNextPath(nextPath));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message.replace(/^Request failed \(\d+\): /, ""));
      } else {
        setError("Login failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f2937,_#0a0f14_55%)] px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-panel/85 p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">OpsWatch</p>
        <h1 className="mt-2 text-3xl font-semibold text-accent">Dashboard Login</h1>
        <p className="mt-2 text-sm text-slate-300">
          Sign in with your OpsWatch user account to access the control surface.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="ow-field-label block">
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="ow-input"
              required
            />
          </label>

          <label className="ow-field-label block">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="ow-input"
              required
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button type="submit" className="ow-btn-primary w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
