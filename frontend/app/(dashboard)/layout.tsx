import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/lib/server-auth";

function cookieHeaderFromStore(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieStore = await cookies();
  const currentUser = await requireCurrentUser(cookieHeaderFromStore(cookieStore));

  return <AppShell currentUser={currentUser}>{children}</AppShell>;
}
