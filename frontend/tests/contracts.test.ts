import { describe, expect, it } from "vitest";

import {
  checkRunSchema,
  incidentSchema,
  monitorSchema,
  monitorStatsSchema,
  overviewSchema,
  statusSchema,
  summarySchema,
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

  it("parses summary, overview, incident, runs, monitor, monitor stats and version payloads", () => {
    expect(
      summarySchema.parse({
        monitors: { total: 1, enabled: 1 },
        incidents: {
          open: 1,
          latest_open: [
            {
              id: 3,
              monitor_id: 1,
              monitor_name: "API",
              opened_at: "2026-03-09T00:00:00Z",
              failure_count: 3,
              last_error: "timeout",
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
        status: "open",
        opened_at: "2026-03-09T00:00:00Z",
        resolved_at: null,
        failure_count: 3,
        last_error: "timeout",
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
        monitor: { id: 1, name: "API", type: "http", target: "https://example.com" },
        window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
        runs: { total: 10, success: 9, failure: 1, uptime_pct: 90 },
        latency_ms: { p50: 100, p95: 200, min: 80, max: 250 },
      }),
    ).toBeTruthy();

    expect(versionSchema.parse({ version: "0.1.0", commit: "abc123", built_at: "2026-03-09T00:00:00Z" })).toBeTruthy();
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