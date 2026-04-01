import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchCurrentUser } from "@/lib/server-auth";
import { LoginView } from "@/views/login-view";

function cookieHeaderFromStore(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function safeNextPath(value: string | string[] | undefined) {
  const nextPath = Array.isArray(value) ? value[0] : value;
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/overview";
  }
  return nextPath;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const currentUser = await fetchCurrentUser(cookieHeaderFromStore(cookieStore));
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);

  if (currentUser) {
    redirect(nextPath);
  }

  return <LoginView nextPath={nextPath} />;
}
