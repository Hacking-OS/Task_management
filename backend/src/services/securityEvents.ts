import crypto from "crypto";
import { db } from "../db.js";

export type SecurityEventResult = "SUCCESS" | "DENIED" | "FAILED" | "BLOCKED" | "REQUIRES_APPROVAL";
export type SecurityRiskLevel = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEventInput {
  requestId?: string | null;
  sessionId?: string | null;
  actorUserId?: string | null;
  workspaceId?: string | null;
  teamId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  route?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  result: SecurityEventResult;
  reason?: string;
  statusCode?: number | null;
  riskLevel?: SecurityRiskLevel;
  metadata?: Record<string, unknown>;
}

function lastEventHash(): string {
  const row = db.prepare(`
    SELECT event_hash FROM security_events ORDER BY timestamp DESC, id DESC LIMIT 1
  `).get() as { event_hash: string } | undefined;
  return row?.event_hash ?? "";
}

function computeEventHash(previousHash: string, payload: string): string {
  return crypto.createHash("sha256").update(`${previousHash}|${payload}`).digest("hex");
}

function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["password", "token", "authorization", "refresh_token", "refreshToken", "secret"]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (blocked.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Append-only security audit record with tamper-evident hash chain. */
export function logSecurityEvent(input: SecurityEventInput): string {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const previousHash = lastEventHash();
  const metadata = JSON.stringify(sanitizeMetadata(input.metadata ?? {}));
  const canonical = [
    timestamp,
    input.action,
    input.result,
    input.actorUserId ?? "",
    input.workspaceId ?? "",
    input.resourceType ?? "",
    input.resourceId ?? "",
    metadata,
  ].join("|");
  const eventHash = computeEventHash(previousHash, canonical);

  db.prepare(`
    INSERT INTO security_events (
      id, timestamp, request_id, session_id, actor_user_id, workspace_id, team_id,
      source_ip, user_agent, http_method, route, action, resource_type, resource_id,
      result, reason, status_code, risk_level, metadata, previous_hash, event_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    input.requestId ?? null,
    input.sessionId ?? null,
    input.actorUserId ?? null,
    input.workspaceId ?? null,
    input.teamId ?? null,
    input.sourceIp ?? null,
    input.userAgent ?? "",
    input.httpMethod ?? null,
    input.route ?? null,
    input.action,
    input.resourceType ?? null,
    input.resourceId ?? null,
    input.result,
    input.reason ?? "",
    input.statusCode ?? null,
    input.riskLevel ?? defaultRiskLevel(input),
    metadata,
    previousHash,
    eventHash
  );

  return id;
}

function defaultRiskLevel(input: SecurityEventInput): SecurityRiskLevel {
  if (input.riskLevel) return input.riskLevel;
  if (input.result === "DENIED" || input.result === "BLOCKED") return "MEDIUM";
  if (input.action.includes("ESCALATION") || input.action.includes("UNAUTHORIZED")) return "HIGH";
  if (input.action.startsWith("LOGIN_FAILED")) return "MEDIUM";
  return "INFO";
}

export function listSecurityEvents(filters: {
  workspaceId?: string;
  actorUserId?: string;
  riskLevel?: SecurityRiskLevel;
  limit?: number;
}) {
  let sql = "SELECT * FROM security_events WHERE 1=1";
  const params: unknown[] = [];
  if (filters.workspaceId) {
    sql += " AND workspace_id = ?";
    params.push(filters.workspaceId);
  }
  if (filters.actorUserId) {
    sql += " AND actor_user_id = ?";
    params.push(filters.actorUserId);
  }
  if (filters.riskLevel) {
    sql += " AND risk_level = ?";
    params.push(filters.riskLevel);
  }
  sql += " ORDER BY timestamp DESC LIMIT ?";
  params.push(Math.min(filters.limit ?? 100, 500));
  return db.prepare(sql).all(...params);
}
