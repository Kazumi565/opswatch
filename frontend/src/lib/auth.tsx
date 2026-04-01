"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { AuthMe } from "@/lib/schemas";

const AuthContext = createContext<AuthMe | null>(null);

export function AuthProvider({
  currentUser,
  children,
}: Readonly<{
  currentUser: AuthMe;
  children: ReactNode;
}>) {
  return <AuthContext.Provider value={currentUser}>{children}</AuthContext.Provider>;
}

export function useCurrentUser() {
  const currentUser = useContext(AuthContext);
  if (!currentUser) {
    throw new Error("useCurrentUser must be used inside AuthProvider");
  }
  return currentUser;
}

export function hasRole(role: AuthMe["role"], allowedRoles: AuthMe["role"][]) {
  return allowedRoles.includes(role);
}
