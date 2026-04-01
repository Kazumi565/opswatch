"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { RefreshButton } from "@/components/refresh-button";
import { formatDate } from "@/lib/format";
import { apiRequest, ApiError } from "@/lib/http";
import { useCurrentUser } from "@/lib/auth";
import { userSchema, type User } from "@/lib/schemas";
import { useApiQuery } from "@/lib/use-api-query";

export function UsersView() {
  const currentUser = useCurrentUser();
  const query = useApiQuery("/opswatch-api/api/users", userSchema.array());
  const [drafts, setDrafts] = useState<Record<number, { role: User["role"]; is_active: boolean }>>({});
  const [createState, setCreateState] = useState({
    email: "",
    display_name: "",
    password: "",
    role: "user" as User["role"],
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const users = useMemo(() => query.data ?? [], [query.data]);
  const draftMap = useMemo(() => {
    const nextDrafts: Record<number, { role: User["role"]; is_active: boolean }> = {};
    for (const user of users) {
      nextDrafts[user.id] = drafts[user.id] ?? { role: user.role, is_active: user.is_active };
    }
    return nextDrafts;
  }, [drafts, users]);

  async function createUser() {
    setCreating(true);
    setError(null);
    try {
      await apiRequest(
        "/opswatch-api/api/users",
        {
          method: "POST",
          body: JSON.stringify(createState),
        },
        { csrf: true },
      );
      setCreateState({
        email: "",
        display_name: "",
        password: "",
        role: "user",
        is_active: true,
      });
      await query.mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function saveUser(user: User) {
    const draft = draftMap[user.id];
    if (!draft || (draft.role === user.role && draft.is_active === user.is_active)) {
      return;
    }

    setBusyUserId(user.id);
    setError(null);
    try {
      await apiRequest(
        `/opswatch-api/api/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            role: draft.role,
            is_active: draft.is_active,
          }),
        },
        { csrf: true },
      );
      await query.mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    } finally {
      setBusyUserId(null);
    }
  }

  if (query.isLoading && !query.data) {
    return <LoadingState message="Loading users..." />;
  }

  if (query.error) {
    return <ErrorState message={String(query.error)} />;
  }

  return (
    <div className="ow-page" data-testid="users-view">
      <PageHeader
        title="Users"
        description="Create users, change roles, and activate or deactivate access."
        actions={<RefreshButton onRefresh={() => query.mutate()} />}
      />

      <Panel className="space-y-3 p-4">
        <h3 className="ow-section-title">Create user</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="ow-field-label">
            Email
            <input
              className="ow-input"
              value={createState.email}
              onChange={(event) => setCreateState((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label className="ow-field-label">
            Display name
            <input
              className="ow-input"
              value={createState.display_name}
              onChange={(event) =>
                setCreateState((current) => ({ ...current, display_name: event.target.value }))
              }
            />
          </label>
          <label className="ow-field-label">
            Password
            <input
              type="password"
              className="ow-input"
              value={createState.password}
              onChange={(event) => setCreateState((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <label className="ow-field-label">
            Role
            <select
              className="ow-input"
              value={createState.role}
              onChange={(event) =>
                setCreateState((current) => ({ ...current, role: event.target.value as User["role"] }))
              }
            >
              <option value="user">user</option>
              <option value="programmer">programmer</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="ow-field-label">
            Active
            <select
              className="ow-input"
              value={createState.is_active ? "true" : "false"}
              onChange={(event) =>
                setCreateState((current) => ({ ...current, is_active: event.target.value === "true" }))
              }
            >
              <option value="true">active</option>
              <option value="false">inactive</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="ow-btn-primary" onClick={createUser} disabled={creating}>
            {creating ? "Creating..." : "Create user"}
          </button>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
      </Panel>

      {users.length === 0 ? (
        <EmptyState message="No users found." />
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const draft = draftMap[user.id];
            const disableSelfRole = user.id === currentUser.id;
            const disableSelfActive = user.id === currentUser.id;

            return (
              <Panel key={user.id} className="p-4">
                <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-end">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{user.display_name}</p>
                    <p className="mt-1 text-xs text-slate-400">{user.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Last login {formatDate(user.last_login_at)} | Updated {formatDate(user.updated_at)}
                    </p>
                  </div>

                  <label className="ow-field-label">
                    Role
                    <select
                      className="ow-input"
                      value={draft.role}
                      disabled={disableSelfRole}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: {
                            role: event.target.value as User["role"],
                            is_active: draft.is_active,
                          },
                        }))
                      }
                    >
                      <option value="user">user</option>
                      <option value="programmer">programmer</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>

                  <label className="ow-field-label">
                    Active
                    <select
                      className="ow-input"
                      value={draft.is_active ? "true" : "false"}
                      disabled={disableSelfActive}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [user.id]: {
                            role: draft.role,
                            is_active: event.target.value === "true",
                          },
                        }))
                      }
                    >
                      <option value="true">active</option>
                      <option value="false">inactive</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="ow-btn-primary"
                    onClick={() => saveUser(user)}
                    disabled={busyUserId === user.id}
                  >
                    {busyUserId === user.id ? "Saving..." : "Save"}
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
