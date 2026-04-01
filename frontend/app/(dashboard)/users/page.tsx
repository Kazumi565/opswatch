import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fetchCurrentUser } from "@/lib/server-auth";
import { UsersView } from "@/views/users-view";

function cookieHeaderFromStore(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export default async function UsersPage() {
  const cookieStore = await cookies();
  const currentUser = await fetchCurrentUser(cookieHeaderFromStore(cookieStore));
  if (!currentUser || currentUser.role !== "admin") {
    redirect("/overview");
  }
  return <UsersView />;
}
