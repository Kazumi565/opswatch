import React from "react";

import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChecksView } from "@/views/checks-view";
import { IncidentsView } from "@/views/incidents-view";
import { MonitorsView } from "@/views/monitors-view";
import { OverviewView } from "@/views/overview-view";

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

function renderWithSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        revalidateOnFocus: false,
      }}
    >
      {ui}
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
  open_incidents: [],
};

const summaryPayload = {
  monitors: { total: 1, enabled: 1 },
  incidents: { open: 0, latest_open: [] },
};

const overviewPayload = {
  window: { minutes: 60, start: "2026-03-08T23:00:00Z", end: "2026-03-09T00:00:00Z" },
  monitors: statusPayload.monitors,
};

const monitorStatsPayload = {
  monitor: { id: 1, name: "API", type: "http", target: "https://example.com" },
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
    status: "open",
    opened_at: "2026-03-09T00:00:00Z",
    resolved_at: null,
    failure_count: 3,
    last_error: "timeout",
  },
];

const monitorPayload = [
  {
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
      { match: "/api/version", body: { version: "0.1.0", commit: "abc", built_at: "2026-03-09T00:00:00Z" } },
    ]);

    renderWithSWR(<OverviewView minutes={60} />);

    expect(await screen.findByTestId("overview-view")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("renders monitors page with drilldown data", async () => {
    mockFetch([
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/monitors/1/stats", body: monitorStatsPayload },
      { match: "/api/monitors/1/runs", body: runsPayload },
    ]);

    renderWithSWR(<MonitorsView minutes={60} selectedMonitorId={1} />);

    expect(await screen.findByTestId("monitors-view")).toBeInTheDocument();
    expect(screen.getByText("Selected monitor")).toBeInTheDocument();
  });

  it("renders incidents page using monitor names", async () => {
    mockFetch([{ match: "/api/incidents/open", body: incidentsPayload }]);

    renderWithSWR(<IncidentsView scope="open" />);

    expect(await screen.findByTestId("incidents-view")).toBeInTheDocument();
    expect(screen.getAllByText("API").length).toBeGreaterThan(0);
    expect(screen.getByText("ID 1")).toBeInTheDocument();
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
  });

  it("shows loading state while waiting for overview data", () => {
    vi.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise(() => {
          // intentionally unresolved
        }),
    );

    renderWithSWR(<OverviewView minutes={60} />);

    expect(screen.getByText("Loading overview telemetry...")).toBeInTheDocument();
  });

  it("shows error state when a request fails", async () => {
    mockFetch([
      { match: "/api/status", status: 500, body: { detail: "boom" } },
      { match: "/api/summary", body: summaryPayload },
      { match: "/api/stats/overview", body: overviewPayload },
      { match: "/api/version", body: { version: "0.1.0", commit: "abc", built_at: "2026-03-09T00:00:00Z" } },
    ]);

    renderWithSWR(<OverviewView minutes={60} />);

    expect(await screen.findByText("Data fetch failed")).toBeInTheDocument();
  });

  it("shows empty state when monitors list is empty", async () => {
    mockFetch([{ match: "/api/stats/overview", body: { window: overviewPayload.window, monitors: [] } }]);

    renderWithSWR(<MonitorsView minutes={60} selectedMonitorId={null} />);

    expect(await screen.findByText("No monitors available yet.")).toBeInTheDocument();
  });

  it("shows empty state when checks feed is empty", async () => {
    mockFetch([
      { match: "/api/monitors", body: monitorPayload },
      { match: "/api/runs", body: [] },
    ]);

    renderWithSWR(<ChecksView success="all" monitorId={null} limit={100} />);

    expect(await screen.findByText("No check runs for the selected filters.")).toBeInTheDocument();
  });
});