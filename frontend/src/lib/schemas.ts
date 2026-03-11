import { z } from "zod";

export const checkRunSchema = z.object({
  id: z.number(),
  monitor_id: z.number(),
  monitor_name: z.string().nullable().optional(),
  started_at: z.string(),
  duration_ms: z.number(),
  attempts: z.number(),
  success: z.boolean(),
  status_code: z.number().nullable(),
  error: z.string().nullable(),
});

const latencySchema = z.object({
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const monitorBriefSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  target: z.string(),
  enabled: z.boolean(),
  interval_seconds: z.number(),
  timeout_seconds: z.number(),
});

const maintenanceSchema = z.object({
  active: z.boolean(),
  ends_at: z.string().nullable(),
  reason: z.string().nullable(),
});

const incidentBriefSchema = z.object({
  id: z.number(),
  opened_at: z.string(),
  failure_count: z.number(),
  last_error: z.string().nullable(),
});

export const monitorStatusSchema = z.object({
  monitor: monitorBriefSchema,
  status: z.enum(["up", "down", "unknown", "maintenance"]),
  uptime_pct: z.number().nullable(),
  latency_ms: latencySchema,
  maintenance: maintenanceSchema,
  last_run: checkRunSchema.nullable(),
  open_incident: incidentBriefSchema.nullable(),
});

export const incidentSchema = z.object({
  id: z.number(),
  monitor_id: z.number(),
  monitor_name: z.string().nullable().optional(),
  status: z.string(),
  opened_at: z.string(),
  resolved_at: z.string().nullable(),
  failure_count: z.number(),
  last_error: z.string().nullable(),
});

const windowSchema = z.object({
  minutes: z.number(),
  start: z.string(),
  end: z.string(),
});

export const statusSchema = z.object({
  generated_at: z.string(),
  overall: z.enum(["up", "degraded", "down"]),
  window: windowSchema,
  monitors: z.array(monitorStatusSchema),
  open_incidents: z.array(incidentSchema),
});

export const summarySchema = z.object({
  monitors: z.object({
    total: z.number(),
    enabled: z.number(),
  }),
  incidents: z.object({
    open: z.number(),
    latest_open: z.array(
      z.object({
        id: z.number(),
        monitor_id: z.number(),
        monitor_name: z.string().nullable().optional(),
        opened_at: z.string(),
        failure_count: z.number(),
        last_error: z.string().nullable(),
      }),
    ),
  }),
});

export const overviewSchema = z.object({
  window: windowSchema,
  monitors: z.array(monitorStatusSchema),
});

export const monitorStatsSchema = z.object({
  monitor: z.object({
    id: z.number(),
    name: z.string(),
    type: z.string(),
    target: z.string(),
  }),
  window: windowSchema,
  runs: z.object({
    total: z.number(),
    success: z.number(),
    failure: z.number(),
    uptime_pct: z.number().nullable(),
  }),
  latency_ms: latencySchema,
});

export const maintenanceSchemaOut = z.object({
  id: z.number(),
  monitor_id: z.number().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  reason: z.string().nullable(),
  created_at: z.string(),
});

export const monitorSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  target: z.string(),
  interval_seconds: z.number(),
  timeout_seconds: z.number(),
  incident_threshold: z.number(),
  retries: z.number(),
  http_keyword: z.string().nullable(),
  enabled: z.boolean(),
  created_at: z.string(),
});

export const versionSchema = z.object({
  version: z.string(),
  commit: z.string(),
  built_at: z.string(),
});

export type CheckRun = z.infer<typeof checkRunSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type Monitor = z.infer<typeof monitorSchema>;
export type MonitorStats = z.infer<typeof monitorStatsSchema>;
export type MonitorStatus = z.infer<typeof monitorStatusSchema>;
export type OverviewResponse = z.infer<typeof overviewSchema>;
export type StatusResponse = z.infer<typeof statusSchema>;
export type SummaryResponse = z.infer<typeof summarySchema>;
export type VersionResponse = z.infer<typeof versionSchema>;