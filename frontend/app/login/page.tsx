import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/navigation";
import { fetchCurrentUser } from "@/lib/server-auth";
import { LoginView } from "@/views/login-view";

function cookieHeaderFromStore(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const currentUser = await fetchCurrentUser(cookieHeaderFromStore(cookieStore));
  const params = await searchParams;
  const nextPath = safeNextPath(Array.isArray(params.next) ? params.next[0] : params.next);

  if (currentUser) {
    redirect(nextPath);
  }

  return <LoginView nextPath={nextPath} />;
}
