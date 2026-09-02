import { db } from "../db.js";

export type StatusEntityType = "task" | "issue" | "subtask";

export interface WorkspaceStatus {
  id: string;
  workspace_id: string;
  entity_type: StatusEntityType;
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_closed: number;
  created_at: string;
}

export interface StatusDefinition {
  slug: string;
  label: string;
  color: string;
  sort_order: number;
  is_closed: number;
}

const DEFAULTS: Record<StatusEntityType, StatusDefinition[]> = {
  task: [
    { slug: "todo", label: "To Do", color: "#64748b", sort_order: 0, is_closed: 0 },
    { slug: "in_progress", label: "In Progress", color: "#2563eb", sort_order: 1, is_closed: 0 },
    { slug: "done", label: "Done", color: "#059669", sort_order: 2, is_closed: 1 },
  ],
  issue: [
    { slug: "open", label: "Open", color: "#2563eb", sort_order: 0, is_closed: 0 },
    { slug: "in_progress", label: "In Progress", color: "#d97706", sort_order: 1, is_closed: 0 },
    { slug: "resolved", label: "Resolved", color: "#059669", sort_order: 2, is_closed: 0 },
    { slug: "closed", label: "Closed", color: "#475569", sort_order: 3, is_closed: 1 },
  ],
  subtask: [
    { slug: "todo", label: "To Do", color: "#64748b", sort_order: 0, is_closed: 0 },
    { slug: "done", label: "Done", color: "#059669", sort_order: 1, is_closed: 1 },
  ],
};

export function seedDefaultStatuses(workspaceId: string): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO workspace_statuses (id, workspace_id, entity_type, slug, label, color, sort_order, is_closed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entityType of Object.keys(DEFAULTS) as StatusEntityType[]) {
    for (const s of DEFAULTS[entityType]) {
      insert.run(
        crypto.randomUUID(),
        workspaceId,
        entityType,
        s.slug,
        s.label,
        s.color,
        s.sort_order,
        s.is_closed
      );
    }
  }
}

export function migrateAllWorkspaceStatuses(): void {
  const workspaces = db.prepare("SELECT id FROM workspaces").all() as { id: string }[];
  for (const ws of workspaces) {
    const count = db.prepare(`
      SELECT COUNT(*) AS c FROM workspace_statuses WHERE workspace_id = ?
    `).get(ws.id) as { c: number };
    if (count.c === 0) seedDefaultStatuses(ws.id);
  }
}

export function listStatuses(workspaceId: string, entityType?: StatusEntityType): WorkspaceStatus[] {
  if (entityType) {
    return db.prepare(`
      SELECT * FROM workspace_statuses
      WHERE workspace_id = ? AND entity_type = ?
      ORDER BY sort_order ASC, label ASC
    `).all(workspaceId, entityType) as WorkspaceStatus[];
  }
  return db.prepare(`
    SELECT * FROM workspace_statuses
    WHERE workspace_id = ?
    ORDER BY entity_type ASC, sort_order ASC, label ASC
  `).all(workspaceId) as WorkspaceStatus[];
}

export function getStatus(workspaceId: string, entityType: StatusEntityType, slug: string): WorkspaceStatus | undefined {
  return db.prepare(`
    SELECT * FROM workspace_statuses
    WHERE workspace_id = ? AND entity_type = ? AND slug = ?
  `).get(workspaceId, entityType, slug) as WorkspaceStatus | undefined;
}

export function validateStatus(workspaceId: string | null | undefined, entityType: StatusEntityType, slug: string): void {
  if (!workspaceId) return;
  const status = getStatus(workspaceId, entityType, slug);
  if (!status) throw new Error(`Invalid ${entityType} status "${slug}" for this workspace`);
}

export function getDefaultStatusSlug(workspaceId: string, entityType: StatusEntityType): string {
  const first = db.prepare(`
    SELECT slug FROM workspace_statuses
    WHERE workspace_id = ? AND entity_type = ?
    ORDER BY sort_order ASC LIMIT 1
  `).get(workspaceId, entityType) as { slug: string } | undefined;
  return first?.slug ?? DEFAULTS[entityType][0].slug;
}

export function createStatus(
  workspaceId: string,
  entityType: StatusEntityType,
  data: { slug: string; label: string; color: string; sort_order?: number; is_closed?: number }
): WorkspaceStatus {
  const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
  if (!slug) throw new Error("Status slug is required");

  const existing = getStatus(workspaceId, entityType, slug);
  if (existing) throw new Error("A status with this slug already exists in the workspace");

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_statuses (id, workspace_id, entity_type, slug, label, color, sort_order, is_closed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspaceId,
    entityType,
    slug,
    data.label.trim(),
    data.color,
    data.sort_order ?? 99,
    data.is_closed ?? 0
  );

  return db.prepare("SELECT * FROM workspace_statuses WHERE id = ?").get(id) as WorkspaceStatus;
}

export function updateStatus(
  workspaceId: string,
  statusId: string,
  data: Partial<{ label: string; color: string; sort_order: number; is_closed: number }>
): WorkspaceStatus {
  const current = db.prepare(`
    SELECT * FROM workspace_statuses WHERE id = ? AND workspace_id = ?
  `).get(statusId, workspaceId) as WorkspaceStatus | undefined;
  if (!current) throw new Error("Status not found");

  db.prepare(`
    UPDATE workspace_statuses SET
      label = ?, color = ?, sort_order = ?, is_closed = ?
    WHERE id = ?
  `).run(
    data.label ?? current.label,
    data.color ?? current.color,
    data.sort_order ?? current.sort_order,
    data.is_closed ?? current.is_closed,
    statusId
  );

  return db.prepare("SELECT * FROM workspace_statuses WHERE id = ?").get(statusId) as WorkspaceStatus;
}

export function deleteStatus(workspaceId: string, statusId: string): void {
  const current = db.prepare(`
    SELECT * FROM workspace_statuses WHERE id = ? AND workspace_id = ?
  `).get(statusId, workspaceId) as WorkspaceStatus | undefined;
  if (!current) throw new Error("Status not found");

  const count = db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_statuses
    WHERE workspace_id = ? AND entity_type = ?
  `).get(workspaceId, current.entity_type) as { c: number };
  if (count.c <= 1) throw new Error("Each workspace must keep at least one status");

  db.prepare("DELETE FROM workspace_statuses WHERE id = ?").run(statusId);
}
