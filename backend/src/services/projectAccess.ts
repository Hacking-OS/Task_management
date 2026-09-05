import { db } from "../db.js";
import { isWorkspaceOwner } from "./authorization.js";

export type ProjectRoleInProject = "lead" | "member" | "reviewer";

export interface ProjectAccessViaTeam {
  team_id: string;
  team_name: string;
  role_in_team: string | null;
}

export interface ProjectAccessResult {
  hasAccess: boolean;
  directMember: boolean;
  directRole: ProjectRoleInProject | null;
  viaTeams: ProjectAccessViaTeam[];
  isWorkspaceOwner: boolean;
  isProjectLead: boolean;
}

function getMemberId(userId: string, workspaceId: string): string | undefined {
  const row = db.prepare(`
    SELECT id FROM workspace_members WHERE user_id = ? AND workspace_id = ?
  `).get(userId, workspaceId) as { id: string } | undefined;
  return row?.id;
}

function getDirectMembership(projectId: string, memberId: string): { role_in_project: ProjectRoleInProject } | undefined {
  return db.prepare(`
    SELECT role_in_project FROM project_members
    WHERE project_id = ? AND member_id = ? AND status = 'active'
  `).get(projectId, memberId) as { role_in_project: ProjectRoleInProject } | undefined;
}

function getTeamsGrantingAccess(projectId: string, memberId: string): ProjectAccessViaTeam[] {
  return db.prepare(`
    SELECT pt.team_id, t.name AS team_name, tm.role_in_team
    FROM project_teams pt
    JOIN workspace_teams t ON t.id = pt.team_id
    JOIN team_members tm ON tm.team_id = pt.team_id AND tm.member_id = ?
    WHERE pt.project_id = ? AND pt.status = 'active' AND t.workspace_id = pt.workspace_id
    ORDER BY t.name ASC
  `).all(memberId, projectId) as ProjectAccessViaTeam[];
}

export function resolveProjectAccess(userId: string, workspaceId: string, projectId: string): ProjectAccessResult {
  const owner = isWorkspaceOwner(userId, workspaceId);
  const memberId = getMemberId(userId, workspaceId);

  if (owner) {
    const direct = memberId ? getDirectMembership(projectId, memberId) : undefined;
    const viaTeams = memberId ? getTeamsGrantingAccess(projectId, memberId) : [];
    return {
      hasAccess: true,
      directMember: !!direct,
      directRole: direct?.role_in_project ?? null,
      viaTeams,
      isWorkspaceOwner: true,
      isProjectLead: direct?.role_in_project === "lead",
    };
  }

  if (!memberId) {
    return {
      hasAccess: false,
      directMember: false,
      directRole: null,
      viaTeams: [],
      isWorkspaceOwner: false,
      isProjectLead: false,
    };
  }

  const direct = getDirectMembership(projectId, memberId);
  const viaTeams = getTeamsGrantingAccess(projectId, memberId);
  const hasAccess = !!direct || viaTeams.length > 0;

  return {
    hasAccess,
    directMember: !!direct,
    directRole: direct?.role_in_project ?? null,
    viaTeams,
    isWorkspaceOwner: false,
    isProjectLead: direct?.role_in_project === "lead",
  };
}

export function userCanAccessProject(userId: string, workspaceId: string, projectId: string): boolean {
  return resolveProjectAccess(userId, workspaceId, projectId).hasAccess;
}

/** Project IDs the user can access (direct membership ∪ team-derived). Owners see all active projects. */
export function listAccessibleProjectIds(userId: string, workspaceId: string): string[] {
  if (isWorkspaceOwner(userId, workspaceId)) {
    return (db.prepare(`
      SELECT id FROM workspace_projects WHERE workspace_id = ? AND status = 'active'
    `).all(workspaceId) as { id: string }[]).map((r) => r.id);
  }

  const memberId = getMemberId(userId, workspaceId);
  if (!memberId) return [];

  const direct = db.prepare(`
    SELECT project_id AS id FROM project_members
    WHERE member_id = ? AND status = 'active'
      AND project_id IN (SELECT id FROM workspace_projects WHERE workspace_id = ? AND status = 'active')
  `).all(memberId, workspaceId) as { id: string }[];

  const viaTeam = db.prepare(`
    SELECT DISTINCT pt.project_id AS id
    FROM project_teams pt
    JOIN team_members tm ON tm.team_id = pt.team_id
    JOIN workspace_projects p ON p.id = pt.project_id
    WHERE tm.member_id = ? AND pt.status = 'active' AND p.workspace_id = ? AND p.status = 'active'
  `).all(memberId, workspaceId) as { id: string }[];

  return [...new Set([...direct.map((r) => r.id), ...viaTeam.map((r) => r.id)])];
}

export function assertSameWorkspaceTeamProject(workspaceId: string, projectId: string, teamId: string): void {
  const project = db.prepare(`
    SELECT id FROM workspace_projects WHERE id = ? AND workspace_id = ?
  `).get(projectId, workspaceId);
  if (!project) throw new Error("Project not found in workspace");

  const team = db.prepare(`
    SELECT id FROM workspace_teams WHERE id = ? AND workspace_id = ?
  `).get(teamId, workspaceId);
  if (!team) throw new Error("Team not found in workspace");
}
