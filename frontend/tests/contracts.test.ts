import { describe, expect, it } from "vitest";

import {
  auditEventSchema,
  authMeSchema,
  checkRunSchema,
  incidentSchema,
  monitorSchema,
  monitorStatsSchema,
  overviewSchema,
  statusSchema,
  summarySchema,
  userSchema,
  versionSchema,
} from "@/lib/schemas";

describe("API schemas", () => {
  it("parses status payload", () => {
    const parsed = statusSchema.parse({
      generated_at: "2026-03-09T00:00:00Z",
      overall: "up",
      window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
      monitors: [
        {
          monitor: {
            id: 1,
            name: "API",
            type: "http",
            service: "edge-api",
            environment: "prod",
            owner: "platform@opswatch.dev",
            severity: "high",
            runbook_url: "https://runbooks.example.com/edge-api",
            target: "https://example.com",
            enabled: true,
            interval_seconds: 60,
            timeout_seconds: 5,
          },
          status: "up",
          uptime_pct: 100,
          latency_ms: { p50: 100, p95: 200, min: 80, max: 300 },
          maintenance: { active: false, ends_at: null, reason: null },
          last_run: {
            id: 1,
            monitor_id: 1,
            monitor_name: "API",
            started_at: "2026-03-09T00:00:00Z",
            duration_ms: 120,
            attempts: 1,
            success: true,
            status_code: 200,
            error: null,
          },
          open_incident: null,
        },
      ],
      open_incidents: [],
    });

    expect(parsed.overall).toBe("up");
  });

  it("parses summary, overview, incident, runs, monitor, monitor stats, auth and version payloads", () => {
    expect(
      summarySchema.parse({
        monitors: { total: 1, enabled: 1 },
        incidents: {
          open_total: 1,
          open_actionable: 0,
          latest_total_open: [
            {
              id: 3,
              monitor_id: 1,
              monitor_name: "API",
              state: "open",
              opened_at: "2026-03-09T00:00:00Z",
              failure_count: 3,
              last_error: "timeout",
              service: "edge-api",
              environment: "prod",
              owner: "platform@opswatch.dev",
              severity: "high",
              runbook_url: "https://runbooks.example.com/edge-api",
            },
          ],
          latest_actionable_open: [
            {
              id: 3,
              monitor_id: 1,
              monitor_name: "API",
              state: "open",
              opened_at: "2026-03-09T00:00:00Z",
              failure_count: 3,
              last_error: "timeout",
              service: "edge-api",
              environment: "prod",
              owner: "platform@opswatch.dev",
              severity: "high",
              runbook_url: "https://runbooks.example.com/edge-api",
            },
          ],
        },
      }),
    ).toBeTruthy();

    expect(
      overviewSchema.parse({
        window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
        monitors: [],
      }),
    ).toBeTruthy();

    expect(
      incidentSchema.parse({
        id: 1,
        monitor_id: 1,
        monitor_name: "API",
        state: "open",
        opened_at: "2026-03-09T00:00:00Z",
        resolved_at: null,
        failure_count: 3,
        last_error: "timeout",
        service: "edge-api",
        environment: "prod",
        owner: "platform@opswatch.dev",
        severity: "high",
        runbook_url: "https://runbooks.example.com/edge-api",
        timeline: [
          {
            id: 11,
            incident_id: 1,
            event_type: "opened",
            actor: "system",
            note: null,
            created_at: "2026-03-09T00:00:00Z",
          },
        ],
      }),
    ).toBeTruthy();

    expect(
      checkRunSchema.parse({
        id: 1,
        monitor_id: 1,
        monitor_name: "API",
        started_at: "2026-03-09T00:00:00Z",
        duration_ms: 123,
        attempts: 1,
        success: true,
        status_code: 200,
        error: null,
      }),
    ).toBeTruthy();

    expect(
      monitorSchema.parse({
        id: 1,
        name: "API",
        type: "http",
        service: "edge-api",
        environment: "prod",
        owner: "platform@opswatch.dev",
        severity: "high",
        runbook_url: "https://runbooks.example.com/edge-api",
        target: "https://example.com",
        interval_seconds: 60,
        timeout_seconds: 5,
        incident_threshold: 3,
        retries: 0,
        http_keyword: null,
        enabled: true,
        created_at: "2026-03-09T00:00:00Z",
      }),
    ).toBeTruthy();

    expect(
      monitorStatsSchema.parse({
        monitor: {
          id: 1,
          name: "API",
          type: "http",
          service: "edge-api",
          environment: "prod",
          owner: "platform@opswatch.dev",
          severity: "high",
          runbook_url: "https://runbooks.example.com/edge-api",
          target: "https://example.com",
          enabled: true,
          interval_seconds: 60,
          timeout_seconds: 5,
        },
        window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
        runs: { total: 10, success: 9, failure: 1, uptime_pct: 90 },
        latency_ms: { p50: 100, p95: 200, min: 80, max: 250 },
      }),
    ).toBeTruthy();

    expect(versionSchema.parse({ version: "0.2.0", commit: "abc123", built_at: "2026-03-09T00:00:00Z" })).toBeTruthy();

    expect(
      authMeSchema.parse({
        id: 1,
        email: "admin@opswatch.dev",
        display_name: "Admin",
        role: "admin",
        is_active: true,
        auth_method: "session",
        last_login_at: "2026-03-09T00:00:00Z",
        session_expires_at: "2026-03-09T12:00:00Z",
      }),
    ).toBeTruthy();

    expect(
      userSchema.parse({
        id: 7,
        email: "user@opswatch.dev",
        display_name: "User",
        role: "user",
        is_active: true,
        created_at: "2026-03-09T00:00:00Z",
        updated_at: "2026-03-09T00:00:00Z",
        last_login_at: null,
      }),
    ).toBeTruthy();

    expect(
      auditEventSchema.parse({
        id: 99,
        created_at: "2026-03-09T00:00:00Z",
        actor: "admin@opswatch.dev",
        action: "user.create",
        resource_type: "user",
        resource_id: 7,
        summary_json: { role: "user" },
      }),
    ).toBeTruthy();
  });

  it("rejects invalid payloads", () => {
    expect(() =>
      statusSchema.parse({
        generated_at: "2026-03-09T00:00:00Z",
        overall: "broken",
        window: { minutes: 60, start: "x", end: "y" },
        monitors: [],
        open_incidents: [],
      }),
    ).toThrow();

    expect(() => versionSchema.parse({ version: 1, commit: null, built_at: [] })).toThrow();
  });
});
