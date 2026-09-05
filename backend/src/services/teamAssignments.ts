import { db } from "../db.js";
import { requirePermission } from "./authorization.js";

export type TeamEntityType = "task" | "issue" | "subtask";

export interface TeamAssignment {
  id: string;
  workspace_id: string;
  team_id: string;
  entity_type: TeamEntityType;
  entity_id: string;
  assigned_by: string | null;
  created_at: string;
  team_name?: string;
}

function assertEntityInWorkspace(workspaceId: string, entityType: TeamEntityType, entityId: string): void {
  const table = entityType === "task" ? "tasks" : entityType === "issue" ? "issues" : "subtasks";
  const row = db.prepare(`SELECT workspace_id FROM ${table} WHERE id = ?`).get(entityId) as
    | { workspace_id: string | null }
    | undefined;
  if (!row?.workspace_id || row.workspace_id !== workspaceId) {
    throw new Error(`${entityType} not found in workspace`);
  }
}

function assertTeamInWorkspace(workspaceId: string, teamId: string): void {
  const team = db.prepare("SELECT id FROM workspace_teams WHERE id = ? AND workspace_id = ?").get(teamId, workspaceId);
  if (!team) throw new Error("Team not found in workspace");
}

export function assignTeamToEntity(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  entityType: TeamEntityType,
  entityId: string
): TeamAssignment {
  const perm =
    entityType === "task" ? "task.assign" : entityType === "issue" ? "issue.assign" : "subtask.assign";
  requirePermission(actorUserId, workspaceId, perm);

  assertTeamInWorkspace(workspaceId, teamId);
  assertEntityInWorkspace(workspaceId, entityType, entityId);

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO team_assignments (id, workspace_id, team_id, entity_type, entity_id, assigned_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, teamId, entityType, entityId, actorUserId);

  const existing = db.prepare(`
    SELECT * FROM team_assignments
    WHERE workspace_id = ? AND team_id = ? AND entity_type = ? AND entity_id = ?
  `).get(workspaceId, teamId, entityType, entityId) as TeamAssignment;

  return enrichAssignment(existing);
}

export function removeTeamFromEntity(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  entityType: TeamEntityType,
  entityId: string
): void {
  const perm =
    entityType === "task" ? "task.assign" : entityType === "issue" ? "issue.assign" : "subtask.assign";
  requirePermission(actorUserId, workspaceId, perm);
  assertTeamInWorkspace(workspaceId, teamId);
  assertEntityInWorkspace(workspaceId, entityType, entityId);

  db.prepare(`
    DELETE FROM team_assignments
    WHERE workspace_id = ? AND team_id = ? AND entity_type = ? AND entity_id = ?
  `).run(workspaceId, teamId, entityType, entityId);
}

function enrichAssignment(row: TeamAssignment): TeamAssignment {
  const team = db.prepare("SELECT name FROM workspace_teams WHERE id = ?").get(row.team_id) as { name: string };
  return { ...row, team_name: team.name };
}

export function listTeamAssignmentsForEntity(
  workspaceId: string,
  entityType: TeamEntityType,
  entityId: string
): TeamAssignment[] {
  assertEntityInWorkspace(workspaceId, entityType, entityId);
  const rows = db.prepare(`
    SELECT * FROM team_assignments
    WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?
    ORDER BY created_at ASC
  `).all(workspaceId, entityType, entityId) as TeamAssignment[];
  return rows.map(enrichAssignment);
}

export function listTeamAssignmentsForTeam(workspaceId: string, teamId: string): TeamAssignment[] {
  assertTeamInWorkspace(workspaceId, teamId);
  const rows = db.prepare(`
    SELECT * FROM team_assignments WHERE workspace_id = ? AND team_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, teamId) as TeamAssignment[];
  return rows.map(enrichAssignment);
}

export function listTeamsForEntity(
  workspaceId: string,
  entityType: TeamEntityType,
  entityId: string
): { team_id: string; team_name: string }[] {
  return listTeamAssignmentsForEntity(workspaceId, entityType, entityId).map((a) => ({
    team_id: a.team_id,
    team_name: a.team_name ?? "",
  }));
}
