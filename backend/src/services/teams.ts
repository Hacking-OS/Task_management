import { db } from "../db.js";
import { ForbiddenError, requirePermission, isWorkspaceOwner } from "./authorization.js";

export interface WorkspaceTeam {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  lead_member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  team_id: string;
  member_id: string;
  joined_at: string;
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
}

export interface TeamWithDetails extends WorkspaceTeam {
  members: TeamMemberRow[];
  lead_username: string | null;
  member_count: number;
}

function getTeamRow(workspaceId: string, teamId: string): WorkspaceTeam | undefined {
  return db.prepare(`
    SELECT * FROM workspace_teams WHERE id = ? AND workspace_id = ?
  `).get(teamId, workspaceId) as WorkspaceTeam | undefined;
}

export function isTeamLead(userId: string, teamId: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM workspace_teams t
    JOIN workspace_members m ON m.id = t.lead_member_id
    WHERE t.id = ? AND m.user_id = ?
  `).get(teamId, userId);
  return !!row;
}

function requireTeamLeadOrOwner(userId: string, workspaceId: string, teamId: string): void {
  if (isWorkspaceOwner(userId, workspaceId)) return;
  if (isTeamLead(userId, teamId)) return;
  throw new ForbiddenError("Only the workspace owner or team lead can manage this team");
}

export function listTeams(workspaceId: string): TeamWithDetails[] {
  const teams = db.prepare(`
    SELECT * FROM workspace_teams WHERE workspace_id = ? ORDER BY name ASC
  `).all(workspaceId) as WorkspaceTeam[];

  return teams.map((team) => enrichTeam(team));
}

export function getTeam(workspaceId: string, teamId: string): TeamWithDetails | undefined {
  const team = getTeamRow(workspaceId, teamId);
  if (!team) return undefined;
  return enrichTeam(team);
}

function enrichTeam(team: WorkspaceTeam): TeamWithDetails {
  const members = db.prepare(`
    SELECT tm.team_id, tm.member_id, tm.joined_at,
           u.username, u.email, r.name AS role_name, r.slug AS role_slug
    FROM team_members tm
    JOIN workspace_members m ON m.id = tm.member_id
    JOIN users u ON u.id = m.user_id
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE tm.team_id = ?
    ORDER BY u.username ASC
  `).all(team.id) as TeamMemberRow[];

  const lead = team.lead_member_id
    ? (db.prepare(`
        SELECT u.username FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.id = ?
      `).get(team.lead_member_id) as { username: string } | undefined)
    : undefined;

  return {
    ...team,
    members,
    lead_username: lead?.username ?? null,
    member_count: members.length,
  };
}

export function createTeam(
  actorUserId: string,
  workspaceId: string,
  data: { name: string; description?: string; lead_member_id?: string }
): TeamWithDetails {
  requirePermission(actorUserId, workspaceId, "team.create");
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_teams (id, workspace_id, name, description, lead_member_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspaceId, data.name.trim(), data.description ?? "", data.lead_member_id ?? null);

  if (data.lead_member_id) {
    db.prepare(`
      INSERT OR IGNORE INTO team_members (team_id, member_id) VALUES (?, ?)
    `).run(id, data.lead_member_id);
  }

  return enrichTeam(getTeamRow(workspaceId, id)!);
}

export function updateTeam(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  data: { name?: string; description?: string }
): TeamWithDetails {
  requirePermission(actorUserId, workspaceId, "team.edit");
  const team = getTeamRow(workspaceId, teamId);
  if (!team) throw new Error("Team not found");

  db.prepare(`
    UPDATE workspace_teams SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?
  `).run(data.name ?? team.name, data.description ?? team.description, teamId);

  return enrichTeam(getTeamRow(workspaceId, teamId)!);
}

export function deleteTeam(actorUserId: string, workspaceId: string, teamId: string): void {
  requirePermission(actorUserId, workspaceId, "team.delete");
  const team = getTeamRow(workspaceId, teamId);
  if (!team) throw new Error("Team not found");
  db.prepare("DELETE FROM workspace_teams WHERE id = ?").run(teamId);
}

export function setTeamLead(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  memberId: string | null
): TeamWithDetails {
  requirePermission(actorUserId, workspaceId, "team.assign_lead");

  const team = getTeamRow(workspaceId, teamId);
  if (!team) throw new Error("Team not found");

  if (memberId) {
    const onTeam = db.prepare(`
      SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?
    `).get(teamId, memberId);
    if (!onTeam) {
      db.prepare("INSERT INTO team_members (team_id, member_id) VALUES (?, ?)").run(teamId, memberId);
    }
  }

  db.prepare(`
    UPDATE workspace_teams SET lead_member_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(memberId, teamId);

  return enrichTeam(getTeamRow(workspaceId, teamId)!);
}

export function addTeamMember(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  memberId: string
): TeamWithDetails {
  requirePermission(actorUserId, workspaceId, "team.manage_members");
  requireTeamLeadOrOwner(actorUserId, workspaceId, teamId);

  const member = db.prepare(`
    SELECT id FROM workspace_members WHERE id = ? AND workspace_id = ?
  `).get(memberId, workspaceId);
  if (!member) throw new Error("Member not found in workspace");

  db.prepare(`
    INSERT OR IGNORE INTO team_members (team_id, member_id) VALUES (?, ?)
  `).run(teamId, memberId);

  return enrichTeam(getTeamRow(workspaceId, teamId)!);
}

export function removeTeamMember(
  actorUserId: string,
  workspaceId: string,
  teamId: string,
  memberId: string
): TeamWithDetails {
  requirePermission(actorUserId, workspaceId, "team.manage_members");
  requireTeamLeadOrOwner(actorUserId, workspaceId, teamId);

  const team = getTeamRow(workspaceId, teamId);
  if (!team) throw new Error("Team not found");

  if (team.lead_member_id === memberId) {
    db.prepare("UPDATE workspace_teams SET lead_member_id = NULL WHERE id = ?").run(teamId);
  }

  db.prepare("DELETE FROM team_members WHERE team_id = ? AND member_id = ?").run(teamId, memberId);
  return enrichTeam(getTeamRow(workspaceId, teamId)!);
}

export function listTeamsForMember(workspaceId: string, memberId: string): WorkspaceTeam[] {
  return db.prepare(`
    SELECT t.* FROM workspace_teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE t.workspace_id = ? AND tm.member_id = ?
    ORDER BY t.name ASC
  `).all(workspaceId, memberId) as WorkspaceTeam[];
}

export function listTeamsLedByUser(workspaceId: string, userId: string): WorkspaceTeam[] {
  return db.prepare(`
    SELECT t.* FROM workspace_teams t
    JOIN workspace_members m ON m.id = t.lead_member_id
    WHERE t.workspace_id = ? AND m.user_id = ?
  `).all(workspaceId, userId) as WorkspaceTeam[];
}
