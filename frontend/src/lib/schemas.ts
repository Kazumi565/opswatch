import { z } from "zod";

export const userRoleSchema = z.enum(["user", "programmer", "admin"]);

export const incidentEventSchema = z.object({
  id: z.number(),
  incident_id: z.number(),
  event_type: z.enum(["opened", "acknowledged", "resolved", "note_added"]),
  actor: z.string(),
  note: z.string().nullable(),
  created_at: z.string(),
});

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
  service: z.string(),
  environment: z.string(),
  owner: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  runbook_url: z.string().nullable(),
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
  state: z.enum(["open", "acknowledged", "resolved"]),
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
  state: z.enum(["open", "acknowledged", "resolved"]),
  opened_at: z.string(),
  resolved_at: z.string().nullable(),
  failure_count: z.number(),
  last_error: z.string().nullable(),
  service: z.string(),
  environment: z.string(),
  owner: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  runbook_url: z.string().nullable(),
  timeline: z.array(incidentEventSchema).nullable().optional(),
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
    open_total: z.number(),
    open_actionable: z.number(),
    latest_total_open: z.array(
      z.object({
        id: z.number(),
        monitor_id: z.number(),
        monitor_name: z.string().nullable().optional(),
        state: z.enum(["open", "acknowledged", "resolved"]),
        opened_at: z.string(),
        failure_count: z.number(),
        last_error: z.string().nullable(),
        service: z.string(),
        environment: z.string(),
        owner: z.string(),
        severity: z.enum(["critical", "high", "medium", "low"]),
        runbook_url: z.string().nullable(),
      }),
    ),
    latest_actionable_open: z.array(
      z.object({
        id: z.number(),
        monitor_id: z.number(),
        monitor_name: z.string().nullable().optional(),
        state: z.enum(["open", "acknowledged", "resolved"]),
        opened_at: z.string(),
        failure_count: z.number(),
        last_error: z.string().nullable(),
        service: z.string(),
        environment: z.string(),
        owner: z.string(),
        severity: z.enum(["critical", "high", "medium", "low"]),
        runbook_url: z.string().nullable(),
      }),
    ),
  }),
});

export const overviewSchema = z.object({
  window: windowSchema,
  monitors: z.array(monitorStatusSchema),
});

export const monitorStatsSchema = z.object({
  monitor: monitorBriefSchema,
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
  service: z.string(),
  environment: z.string(),
  owner: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  runbook_url: z.string().nullable(),
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

export const authMeSchema = z.object({
  id: z.number().nullable(),
  email: z.string(),
  display_name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  auth_method: z.enum(["session", "api_key"]),
  last_login_at: z.string().nullable(),
  session_expires_at: z.string().nullable(),
});

export const userSchema = z.object({
  id: z.number(),
  email: z.string(),
  display_name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  last_login_at: z.string().nullable(),
});

export const auditEventSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  actor: z.string(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.number(),
  summary_json: z.record(z.string(), z.unknown()),
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
export type AuthMe = z.infer<typeof authMeSchema>;
export type User = z.infer<typeof userSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
