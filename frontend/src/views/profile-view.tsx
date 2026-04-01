"use client";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { formatDate } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth";

export function ProfileView() {
  const currentUser = useCurrentUser();

  return (
    <div className="ow-page" data-testid="profile-view">
      <PageHeader
        title="Profile"
        description="Current user identity, role, and active session details."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <p className="ow-kpi-label">Display name</p>
          <p className="mt-2 text-lg font-medium text-slate-100">{currentUser.display_name}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-slate-400">Email</p>
          <p className="mt-1 text-sm text-slate-200">{currentUser.email}</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Role</p>
          <p className="mt-2 text-lg font-medium text-accent">{currentUser.role}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-slate-400">Auth method</p>
          <p className="mt-1 text-sm text-slate-200">{currentUser.auth_method}</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Last login</p>
          <p className="mt-2 text-sm text-slate-200">{formatDate(currentUser.last_login_at)}</p>
        </Panel>

        <Panel className="p-4">
          <p className="ow-kpi-label">Session expires</p>
          <p className="mt-2 text-sm text-slate-200">{formatDate(currentUser.session_expires_at)}</p>
        </Panel>
      </div>
    </div>
  );
}
