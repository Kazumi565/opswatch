import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authMeSchema, type AuthMe } from "@/lib/schemas";

const defaultApiOrigin =
  process.env.NODE_ENV === "production" ? "http://api:8000" : "http://localhost:8000";
const opswatchApiOrigin = process.env.OPSWATCH_API_ORIGIN ?? defaultApiOrigin;

function currentPathFromHeaders(value: string | null): string {
  if (!value || value.trim() === "") {
    return "/overview";
  }
  return value;
}

export async function fetchCurrentUser(cookieHeader: string | null): Promise<AuthMe | null> {
  const res = await fetch(`${opswatchApiOrigin}/api/auth/me`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to load current user (${res.status}): ${body}`);
  }

  return authMeSchema.parse(await res.json());
}

export async function requireCurrentUser(cookieHeader: string | null): Promise<AuthMe> {
  const currentHeaders = await headers();
  const currentUser = await fetchCurrentUser(cookieHeader);
  if (!currentUser) {
    const next = currentPathFromHeaders(currentHeaders.get("x-opswatch-path"));
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return currentUser;
}
