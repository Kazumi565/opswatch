import React from "react";

import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";
import type { AuthMe } from "@/lib/schemas";
import { ChecksView } from "@/views/checks-view";
import { IncidentsView } from "@/views/incidents-view";
import { MonitorsView } from "@/views/monitors-view";
import { OverviewView } from "@/views/overview-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock("recharts", () => {
  const Div = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Div,
    BarChart: Div,
    CartesianGrid: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Bar: () => null,
  };
});

type RoutePayload = {
  match: string;
  status?: number;
  body: unknown;
};

function mockFetch(routes: RoutePayload[]) {
  vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes.find((candidate) => url.includes(candidate.match));

    if (!route) {
      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    }

    const status = route.status ?? 200;

    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => route.body,
      text: async () => JSON.stringify(route.body),
    } as Response);
  });
}

function renderWithSWR(
  ui: React.ReactElement,
  currentUser: AuthMe = {
    id: 1,
    email: "admin@opswatch.dev",
    display_name: "Admin",
    role: "admin",
    is_active: true,
    auth_method: "session",
    last_login_at: "2026-03-09T00:00:00Z",
    session_expires_at: "2026-03-09T12:00:00Z",
  },
) {
  return render(
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
      }}
    >
      <AuthProvider currentUser={currentUser}>{ui}</AuthProvider>
    </SWRConfig>,
  );
}

const statusPayload = {
  generated_at: "2026-03-09T00:00:00Z",
  overall: "degraded",
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
      uptime_pct: 99,
      latency_ms: { p50: 90, p95: 120, min: 60, max: 220 },
      maintenance: { active: false, ends_at: null, reason: null },
      last_run: {
        id: 1,
        monitor_id: 1,
        monitor_name: "API",
        started_at: "2026-03-09T00:00:00Z",
        duration_ms: 100,
        attempts: 1,
        success: true,
        status_code: 200,
        error: null,
      },
      open_incident: null,
    },
  ],
  open_incidents: [
    {
      id: 11,
      monitor_id: 1,
      monitor_name: "API",
      state: "acknowledged",
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
          id: 101,
          incident_id: 11,
          event_type: "opened",
          actor: "system",
          note: null,
          created_at: "2026-03-09T00:00:00Z",
        },
      ],
    },
  ],
};

const summaryPayload = {
  monitors: { total: 1, enabled: 1 },
  incidents: {
    open_total: 1,
    open_actionable: 1,
    latest_total_open: [
      {
        id: 11,
        monitor_id: 1,
        monitor_name: "API",
        state: "acknowledged",
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
        id: 11,
        monitor_id: 1,
        monitor_name: "API",
        state: "acknowledged",
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
};

const overviewPayload = {
  window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
  monitors: statusPayload.monitors,
};

const monitorStatsPayload = {
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
  latency_ms: { p50: 100, p95: 150, min: 70, max: 210 },
};

const runsPayload = [
  {
    id: 20,
    monitor_id: 1,
    monitor_name: "API",
    started_at: "2026-03-09T00:00:00Z",
    duration_ms: 123,
    attempts: 1,
    success: true,
    status_code: 200,
    error: null,
  },
];

const incidentsPayload = [
  {
    id: 11,
    monitor_id: 1,
    monitor_name: "API",
    state: "acknowledged",
    opened_at: "2026-03-09T00:00:00Z",
    resolved_at: null,
    failure_count: 3,
    last_error: "timeout",
    service: "edge-api",
    environment: "prod",
    owner: "platform@opswatch.dev",
    severity: "high",
    runbook_url: "https://runbooks.example.com/edge-api",
  },
];

const incidentDetailPayload = {
  ...incidentsPayload[0],
  timeline: [
    {
      id: 101,
      incident_id: 11,
      event_type: "opened",
      actor: "system",
      note: null,
      created_at: "2026-03-09T00:00:00Z",
    },
    {
      id: 102,
      incident_id: 11,
      event_type: "acknowledged",
      actor: "api_key",
      note: null,
      created_at: "2026-03-09T00:05:00Z",
    },
    {
      id: 103,
      incident_id: 11,
      event_type: "note_added",
      actor: "api_key",
      note: "Investigating packet loss",
      created_at: "2026-03-09T00:06:00Z",
    },
  ],
};

const monitorPayload = [
  {
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
  },
];

const maintenancePayload = [
  {
    id: 8,
    monitor_id: 1,
    starts_at: "2026-03-09T00:00:00Z",
    ends_at: "2026-03-09T01:00:00Z",
    reason: "deploy",
    created_at: "2026-03-09T00:00:00Z",
  },
];

describe("dashboard views", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders overview page with mocked API data", async () => {
    mockFetch([
      { match: "/api/status", body: statusPayload },
      { match: "/api/summary", body: summaryPayload },
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/version", body: { version: "0.2.0", commit: "abc", built_at: "2026-03-09T00:00:00Z" } },
    ]);

    renderWithSWR(<OverviewView minutes={60} serviceFilter={null} environmentFilter={null} />);

    expect(await screen.findByTestId("overview-view")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Service ownership groups")).toBeInTheDocument();
    expect(screen.getByText("API version 0.2.0 | commit abc | built 2026-03-09T00:00:00Z")).toBeInTheDocument();
  });

  it("hides placeholder build metadata in local overview footer", async () => {
    mockFetch([
      { match: "/api/status", body: statusPayload },
      { match: "/api/summary", body: summaryPayload },
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/version", body: { version: "0.2.0", commit: "unknown", built_at: "unknown" } },
    ]);

    renderWithSWR(<OverviewView minutes={60} serviceFilter={null} environmentFilter={null} />);

    expect(await screen.findByTestId("overview-view")).toBeInTheDocument();
    expect(screen.getByText("API version 0.2.0")).toBeInTheDocument();
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument();
  });

  it("renders monitors page with drilldown data", async () => {
    mockFetch([
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/monitors/1/stats", body: monitorStatsPayload },
      { match: "/api/monitors/1/runs", body: runsPayload },
      { match: "/api/monitors/1", body: monitorPayload[0] },
      { match: "/api/maintenance", body: maintenancePayload },
    ]);

    renderWithSWR(
      <MonitorsView minutes={60} selectedMonitorId={1} serviceFilter={null} environmentFilter={null} />,
    );

    expect(await screen.findByTestId("monitors-view")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected monitor" })).toBeInTheDocument();
    expect(screen.getByText("Runbook")).toBeInTheDocument();
  });

  it("renders incidents page using monitor names and timeline detail", async () => {
    mockFetch([
      { match: "/api/incidents/open", body: incidentsPayload },
      { match: "/api/incidents/11", body: incidentDetailPayload },
    ]);

    renderWithSWR(<IncidentsView scope="open" selectedIncidentId={11} />);

    expect(await screen.findByTestId("incidents-view")).toBeInTheDocument();
    expect(screen.getAllByText("API").length).toBeGreaterThan(0);
    expect(screen.getByText("ID 1")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("renders checks page with monitor names", async () => {
    mockFetch([
      { match: "/api/monitors", body: monitorPayload },
      { match: "/api/runs", body: runsPayload },
    ]);

    renderWithSWR(<ChecksView success="all" monitorId={null} limit={100} />);

    expect(await screen.findByTestId("checks-view")).toBeInTheDocument();
    expect(screen.getByText("#20")).toBeInTheDocument();
    expect(screen.getAllByText("API").length).toBeGreaterThan(0);
    expect(screen.getByText(/The UI refetches API data every 30 seconds/i)).toBeInTheDocument();
  });

  it("shows loading state while waiting for overview data", () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise(() => {
          // intentionally unresolved
        }),
    );

    renderWithSWR(<OverviewView minutes={60} serviceFilter={null} environmentFilter={null} />);

    expect(screen.getByText("Loading overview telemetry...")).toBeInTheDocument();
  });

  it("shows error state when a request fails", async () => {
    mockFetch([
      { match: "/api/status", status: 500, body: { detail: "boom" } },
      { match: "/api/summary", body: summaryPayload },
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/version", body: { version: "0.2.0", commit: "abc", built_at: "2026-03-09T00:00:00Z" } },
    ]);

    renderWithSWR(<OverviewView minutes={60} serviceFilter={null} environmentFilter={null} />);

    expect(await screen.findByText("Data fetch failed")).toBeInTheDocument();
  });

  it("shows empty state when monitors list is empty", async () => {
    mockFetch([{ match: "/api/stats/overview", body: { window: overviewPayload.window, monitors: [] } }]);

    renderWithSWR(
      <MonitorsView minutes={60} selectedMonitorId={null} serviceFilter={null} environmentFilter={null} />,
    );

    expect(await screen.findByText("No monitors available for the selected ownership filters.")).toBeInTheDocument();
  });

  it("shows empty state when checks feed is empty", async () => {
    mockFetch([
      { match: "/api/monitors", body: monitorPayload },
      { match: "/api/runs", body: [] },
    ]);

    renderWithSWR(<ChecksView success="all" monitorId={null} limit={100} />);

    expect(await screen.findByText("No check runs for the selected filters.")).toBeInTheDocument();
  });

  it("renders incident response controls for programmer users", async () => {
    mockFetch([
      { match: "/api/incidents/open", body: incidentsPayload },
      { match: "/api/incidents/11", body: incidentDetailPayload },
    ]);

    renderWithSWR(<IncidentsView scope="open" selectedIncidentId={11} />, {
      id: 2,
      email: "programmer@opswatch.dev",
      display_name: "Programmer",
      role: "programmer",
      is_active: true,
      auth_method: "session",
      last_login_at: "2026-03-09T00:00:00Z",
      session_expires_at: "2026-03-09T12:00:00Z",
    });

    expect(await screen.findByText("Add note")).toBeInTheDocument();
  });

  it("hides incident response controls for read-only users", async () => {
    mockFetch([
      { match: "/api/incidents/open", body: incidentsPayload },
      { match: "/api/incidents/11", body: incidentDetailPayload },
    ]);

    renderWithSWR(<IncidentsView scope="open" selectedIncidentId={11} />, {
      id: 3,
      email: "user@opswatch.dev",
      display_name: "User",
      role: "user",
      is_active: true,
      auth_method: "session",
      last_login_at: "2026-03-09T00:00:00Z",
      session_expires_at: "2026-03-09T12:00:00Z",
    });

    await screen.findByTestId("incidents-view");
    expect(screen.queryByText("Add note")).not.toBeInTheDocument();
    expect(screen.queryByText("Acknowledge incident")).not.toBeInTheDocument();
  });
});
