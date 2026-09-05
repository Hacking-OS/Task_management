import { db } from "../db.js";
import { requirePermission, isWorkspaceOwner } from "./authorization.js";
import {
  assertSameWorkspaceTeamProject,
  listAccessibleProjectIds,
  resolveProjectAccess,
  userCanAccessProject,
  type ProjectRoleInProject,
} from "./projectAccess.js";
import * as teamService from "./teams.js";

export type ProjectStatus = "active" | "archived";

export interface WorkspaceProject {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  lead_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberRow {
  project_id: string;
  member_id: string;
  role_in_project: ProjectRoleInProject;
  status: string;
  joined_at: string;
  username: string;
  email: string;
  role_name: string;
  role_slug: string;
}

export interface ProjectTeamRow {
  project_id: string;
  team_id: string;
  team_name: string;
  member_count: number;
  assigned_at: string;
}

export interface ProjectSummary extends WorkspaceProject {
  lead_username: string | null;
  team_count: number;
  member_count: number;
  open_task_count: number;
  open_issue_count: number;
}

export interface ProjectWithDetails extends ProjectSummary {
  members: ProjectMemberRow[];
  teams: ProjectTeamRow[];
}

function tryHasPermission(userId: string, workspaceId: string, permission: string): boolean {
  try {
    requirePermission(userId, workspaceId, permission);
    return true;
  } catch {
    return false;
  }
}

function getProjectRow(workspaceId: string, projectId: string): WorkspaceProject | undefined {
  return db.prepare(`
    SELECT * FROM workspace_projects WHERE id = ? AND workspace_id = ?
  `).get(projectId, workspaceId) as WorkspaceProject | undefined;
}

/** Ensures actor may mutate a project (permission + project scope when not view_all/owner). */
function requireProjectForMutation(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  permission: string
): WorkspaceProject {
  requirePermission(actorUserId, workspaceId, permission);
  const project = getProjectRow(workspaceId, projectId);
  if (!project) throw new Error("Project not found");

  const viewAll = tryHasPermission(actorUserId, workspaceId, "project.view_all") || isWorkspaceOwner(actorUserId, workspaceId);
  if (!viewAll && !userCanAccessProject(actorUserId, workspaceId, projectId)) {
    throw new Error("Project not found");
  }

  return project;
}

function enrichProject(project: WorkspaceProject): ProjectSummary {
  const lead = project.lead_member_id
    ? (db.prepare(`
        SELECT u.username FROM workspace_members m JOIN users u ON u.id = m.user_id WHERE m.id = ?
      `).get(project.lead_member_id) as { username: string } | undefined)
    : undefined;

  const teamCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM project_teams WHERE project_id = ? AND status = 'active'
  `).get(project.id) as { c: number }).c;

  const memberCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM project_members WHERE project_id = ? AND status = 'active'
  `).get(project.id) as { c: number }).c;

  const openTasks = (db.prepare(`
    SELECT COUNT(*) AS c FROM tasks t
    LEFT JOIN workspace_statuses s ON s.workspace_id = t.workspace_id AND s.entity_type = 'task' AND s.slug = t.status
    WHERE t.project_id = ? AND COALESCE(s.is_closed, 0) = 0
  `).get(project.id) as { c: number }).c;

  const openIssues = (db.prepare(`
    SELECT COUNT(*) AS c FROM issues i
    LEFT JOIN workspace_statuses s ON s.workspace_id = i.workspace_id AND s.entity_type = 'issue' AND s.slug = i.status
    WHERE i.project_id = ? AND COALESCE(s.is_closed, 0) = 0
  `).get(project.id) as { c: number }).c;

  return {
    ...project,
    lead_username: lead?.username ?? null,
    team_count: teamCount,
    member_count: memberCount,
    open_task_count: openTasks,
    open_issue_count: openIssues,
  };
}

function enrichProjectDetails(project: WorkspaceProject): ProjectWithDetails {
  const summary = enrichProject(project);

  const members = db.prepare(`
    SELECT pm.project_id, pm.member_id, pm.role_in_project, pm.status, pm.joined_at,
           u.username, u.email, r.name AS role_name, r.slug AS role_slug
    FROM project_members pm
    JOIN workspace_members m ON m.id = pm.member_id
    JOIN users u ON u.id = m.user_id
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE pm.project_id = ? AND pm.status = 'active'
    ORDER BY u.username ASC
  `).all(project.id) as ProjectMemberRow[];

  const teams = db.prepare(`
    SELECT pt.project_id, pt.team_id, t.name AS team_name, pt.assigned_at,
           (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = pt.team_id) AS member_count
    FROM project_teams pt
    JOIN workspace_teams t ON t.id = pt.team_id
    WHERE pt.project_id = ? AND pt.status = 'active'
    ORDER BY t.name ASC
  `).all(project.id) as ProjectTeamRow[];

  return { ...summary, members, teams };
}

export function listProjectSummaries(actorUserId: string, workspaceId: string, filters?: { status?: ProjectStatus; search?: string }): ProjectSummary[] {
  requirePermission(actorUserId, workspaceId, "project.view");
  const viewAll = tryHasPermission(actorUserId, workspaceId, "project.view_all") || isWorkspaceOwner(actorUserId, workspaceId);

  let projects = db.prepare(`
    SELECT * FROM workspace_projects WHERE workspace_id = ?
    ORDER BY name ASC
  `).all(workspaceId) as WorkspaceProject[];

  if (!viewAll) {
    const allowed = new Set(listAccessibleProjectIds(actorUserId, workspaceId));
    projects = projects.filter((p) => allowed.has(p.id));
  }

  if (filters?.status) {
    projects = projects.filter((p) => p.status === filters.status);
  }
  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    projects = projects.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }

  return projects.map(enrichProject);
}

export function getProject(actorUserId: string, workspaceId: string, projectId: string): ProjectWithDetails | undefined {
  requirePermission(actorUserId, workspaceId, "project.view");
  const project = getProjectRow(workspaceId, projectId);
  if (!project) return undefined;

  const viewAll = tryHasPermission(actorUserId, workspaceId, "project.view_all") || isWorkspaceOwner(actorUserId, workspaceId);
  if (!viewAll && !userCanAccessProject(actorUserId, workspaceId, projectId)) {
    return undefined;
  }

  return enrichProjectDetails(project);
}

export function createProject(
  actorUserId: string,
  workspaceId: string,
  data: { name: string; description?: string; lead_member_id?: string | null }
): ProjectWithDetails {
  requirePermission(actorUserId, workspaceId, "project.create");
  if (data.lead_member_id) {
    const leadMember = db.prepare(`
      SELECT id FROM workspace_members WHERE id = ? AND workspace_id = ?
    `).get(data.lead_member_id, workspaceId);
    if (!leadMember) throw new Error("Member not found in workspace");
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_projects (id, workspace_id, name, description, lead_member_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, data.name.trim(), data.description ?? "", data.lead_member_id ?? null, actorUserId);

  if (data.lead_member_id) {
    db.prepare(`
      INSERT OR REPLACE INTO project_members (project_id, member_id, role_in_project, status, assigned_by)
      VALUES (?, ?, 'lead', 'active', ?)
    `).run(id, data.lead_member_id, actorUserId);
  }

  return enrichProjectDetails(getProjectRow(workspaceId, id)!);
}

export function updateProject(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  data: { name?: string; description?: string; status?: ProjectStatus }
): ProjectWithDetails {
  const project = requireProjectForMutation(actorUserId, workspaceId, projectId, "project.update");

  db.prepare(`
    UPDATE workspace_projects
    SET name = ?, description = ?, status = COALESCE(?, status), updated_at = datetime('now')
    WHERE id = ?
  `).run(data.name ?? project.name, data.description ?? project.description, data.status ?? null, projectId);

  return enrichProjectDetails(getProjectRow(workspaceId, projectId)!);
}

export function setProjectLead(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  memberId: string | null
): ProjectWithDetails {
  requireProjectForMutation(actorUserId, workspaceId, projectId, "project.change_lead");

  if (memberId) {
    const member = db.prepare(`SELECT id FROM workspace_members WHERE id = ? AND workspace_id = ?`).get(memberId, workspaceId);
    if (!member) throw new Error("Member not found in workspace");
    db.prepare(`
      INSERT OR REPLACE INTO project_members (project_id, member_id, role_in_project, status, assigned_by)
      VALUES (?, ?, 'lead', 'active', ?)
    `).run(projectId, memberId, actorUserId);
  } else {
    db.prepare(`
      UPDATE project_members SET role_in_project = 'member'
      WHERE project_id = ? AND role_in_project = 'lead' AND status = 'active'
    `).run(projectId);
  }

  db.prepare(`
    UPDATE workspace_projects SET lead_member_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(memberId, projectId);

  return enrichProjectDetails(getProjectRow(workspaceId, projectId)!);
}

export function deleteProject(actorUserId: string, workspaceId: string, projectId: string): void {
  requireProjectForMutation(actorUserId, workspaceId, projectId, "project.delete");
  db.prepare("DELETE FROM workspace_projects WHERE id = ?").run(projectId);
}

export function setProjectTeams(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  teamIds: string[]
): ProjectWithDetails {
  requireProjectForMutation(actorUserId, workspaceId, projectId, "project.assign_teams");

  const uniqueTeamIds = [...new Set(teamIds)];
  for (const teamId of uniqueTeamIds) {
    assertSameWorkspaceTeamProject(workspaceId, projectId, teamId);
  }

  const tx = db.transaction(() => {
    if (uniqueTeamIds.length === 0) {
      db.prepare(`
        UPDATE project_teams SET status = 'removed' WHERE project_id = ? AND status = 'active'
      `).run(projectId);
    } else {
      db.prepare(`
        UPDATE project_teams SET status = 'removed'
        WHERE project_id = ? AND team_id NOT IN (${uniqueTeamIds.map(() => "?").join(",")})
      `).run(projectId, ...uniqueTeamIds);
    }

    for (const teamId of uniqueTeamIds) {
      db.prepare(`
        INSERT INTO project_teams (project_id, team_id, workspace_id, assigned_by, status)
        VALUES (?, ?, ?, ?, 'active')
        ON CONFLICT(project_id, team_id) DO UPDATE SET status = 'active', assigned_by = excluded.assigned_by, assigned_at = datetime('now')
      `).run(projectId, teamId, workspaceId, actorUserId);
    }
  });
  tx();

  return enrichProjectDetails(getProjectRow(workspaceId, projectId)!);
}

export function addProjectMember(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  memberId: string,
  roleInProject: ProjectRoleInProject = "member"
): ProjectWithDetails {
  const project = requireProjectForMutation(actorUserId, workspaceId, projectId, "project.manage_members");

  const member = db.prepare(`SELECT id FROM workspace_members WHERE id = ? AND workspace_id = ?`).get(memberId, workspaceId);
  if (!member) throw new Error("Member not found in workspace");

  if (roleInProject === "lead") {
    db.prepare(`UPDATE workspace_projects SET lead_member_id = ?, updated_at = datetime('now') WHERE id = ?`).run(memberId, projectId);
    db.prepare(`
      UPDATE project_members SET role_in_project = 'member'
      WHERE project_id = ? AND role_in_project = 'lead' AND member_id != ? AND status = 'active'
    `).run(projectId, memberId);
  }

  db.prepare(`
    INSERT INTO project_members (project_id, member_id, role_in_project, status, assigned_by)
    VALUES (?, ?, ?, 'active', ?)
    ON CONFLICT(project_id, member_id) DO UPDATE SET
      role_in_project = excluded.role_in_project,
      status = 'active',
      assigned_by = excluded.assigned_by
  `).run(projectId, memberId, roleInProject, actorUserId);

  return enrichProjectDetails(getProjectRow(workspaceId, projectId)!);
}

export function removeProjectMember(
  actorUserId: string,
  workspaceId: string,
  projectId: string,
  memberId: string
): ProjectWithDetails {
  const project = requireProjectForMutation(actorUserId, workspaceId, projectId, "project.manage_members");

  db.prepare(`
    UPDATE project_members SET status = 'removed' WHERE project_id = ? AND member_id = ?
  `).run(projectId, memberId);

  if (project.lead_member_id === memberId) {
    db.prepare(`UPDATE workspace_projects SET lead_member_id = NULL, updated_at = datetime('now') WHERE id = ?`).run(projectId);
  }

  return enrichProjectDetails(getProjectRow(workspaceId, projectId)!);
}

export function listProjectsForTeam(actorUserId: string, workspaceId: string, teamId: string): ProjectSummary[] {
  requirePermission(actorUserId, workspaceId, "team.view");
  const team = db.prepare(`
    SELECT id FROM workspace_teams WHERE id = ? AND workspace_id = ?
  `).get(teamId, workspaceId);
  if (!team) throw new Error("Team not found");

  let projects = db.prepare(`
    SELECT p.* FROM workspace_projects p
    JOIN project_teams pt ON pt.project_id = p.id
    WHERE pt.team_id = ? AND pt.status = 'active' AND p.workspace_id = ?
    ORDER BY p.name ASC
  `).all(teamId, workspaceId) as WorkspaceProject[];

  const viewAll = tryHasPermission(actorUserId, workspaceId, "project.view_all") || isWorkspaceOwner(actorUserId, workspaceId);
  if (!viewAll) {
    const allowed = new Set(listAccessibleProjectIds(actorUserId, workspaceId));
    projects = projects.filter((p) => allowed.has(p.id));
  }

  return projects.map(enrichProject);
}

export function listTeamsForMemberUser(workspaceId: string, userId: string): ReturnType<typeof teamService.listTeamsForMember> {
  const member = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string } | undefined;
  if (!member) return [];
  return teamService.listTeamsForMember(workspaceId, member.id);
}

export function listProjectsForMemberUser(workspaceId: string, userId: string): ProjectSummary[] {
  const ids = listAccessibleProjectIds(userId, workspaceId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const projects = db.prepare(`
    SELECT * FROM workspace_projects WHERE id IN (${placeholders}) ORDER BY name ASC
  `).all(...ids) as WorkspaceProject[];
  return projects.map(enrichProject);
}

export interface MemberManagementSummary {
  member_id: string;
  user_id: string;
  username: string;
  email: string;
  workspace_role_name: string;
  workspace_role_slug: string;
  is_owner: boolean;
  teams: { id: string; name: string; role_in_team: string | null; is_lead: boolean }[];
  projects: {
    id: string;
    name: string;
    role_in_project: ProjectRoleInProject | null;
    access_type: "direct" | "team";
  }[];
}

export function getMemberManagementSummary(workspaceId: string, memberId: string): MemberManagementSummary | undefined {
  const member = db.prepare(`
    SELECT m.id, m.user_id, u.username, u.email, r.name AS role_name, r.slug AS role_slug,
           CASE WHEN w.user_id = m.user_id THEN 1 ELSE 0 END AS is_owner
    FROM workspace_members m
    JOIN users u ON u.id = m.user_id
    JOIN workspace_roles r ON r.id = m.role_id
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.id = ? AND m.workspace_id = ?
  `).get(memberId, workspaceId) as {
    id: string;
    user_id: string;
    username: string;
    email: string;
    role_name: string;
    role_slug: string;
    is_owner: number;
  } | undefined;

  if (!member) return undefined;

  const teams = db.prepare(`
    SELECT t.id, t.name, tm.role_in_team,
           CASE WHEN t.lead_member_id = tm.member_id THEN 1 ELSE 0 END AS is_lead
    FROM team_members tm
    JOIN workspace_teams t ON t.id = tm.team_id
    WHERE tm.member_id = ? AND t.workspace_id = ?
    ORDER BY t.name ASC
  `).all(memberId, workspaceId) as { id: string; name: string; role_in_team: string | null; is_lead: number }[];

  const directProjects = db.prepare(`
    SELECT p.id, p.name, pm.role_in_project
    FROM project_members pm
    JOIN workspace_projects p ON p.id = pm.project_id
    WHERE pm.member_id = ? AND pm.status = 'active' AND p.workspace_id = ?
  `).all(memberId, workspaceId) as { id: string; name: string; role_in_project: ProjectRoleInProject }[];

  const teamProjects = db.prepare(`
    SELECT DISTINCT p.id, p.name
    FROM project_teams pt
    JOIN team_members tm ON tm.team_id = pt.team_id
    JOIN workspace_projects p ON p.id = pt.project_id
    WHERE tm.member_id = ? AND pt.status = 'active' AND p.workspace_id = ?
  `).all(memberId, workspaceId) as { id: string; name: string }[];

  const directIds = new Set(directProjects.map((p) => p.id));
  const projects = [
    ...directProjects.map((p) => ({
      id: p.id,
      name: p.name,
      role_in_project: p.role_in_project,
      access_type: "direct" as const,
    })),
    ...teamProjects
      .filter((p) => !directIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        role_in_project: null,
        access_type: "team" as const,
      })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    member_id: member.id,
    user_id: member.user_id,
    username: member.username,
    email: member.email,
    workspace_role_name: member.role_name,
    workspace_role_slug: member.role_slug,
    is_owner: member.is_owner === 1,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      role_in_team: t.role_in_team,
      is_lead: t.is_lead === 1,
    })),
    projects,
  };
}

export interface WorkspaceOverviewStats {
  project_count: number;
  active_project_count: number;
  team_count: number;
  member_count: number;
  pending_approval_count: number;
  pending_team_request_count: number;
  security_alert_count: number;
}

export function getWorkspaceOverview(actorUserId: string, workspaceId: string): WorkspaceOverviewStats {
  requirePermission(actorUserId, workspaceId, "workspace.view");

  const projectCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ?
  `).get(workspaceId) as { c: number }).c;

  const activeProjectCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ? AND status = 'active'
  `).get(workspaceId) as { c: number }).c;

  const teamCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_teams WHERE workspace_id = ?
  `).get(workspaceId) as { c: number }).c;

  const memberCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ?
  `).get(workspaceId) as { c: number }).c;

  const pendingApprovalCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM approval_requests WHERE workspace_id = ? AND status = 'pending'
  `).get(workspaceId) as { c: number }).c;

  const pendingTeamRequestCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM team_membership_requests WHERE workspace_id = ? AND status = 'pending'
  `).get(workspaceId) as { c: number }).c;

  const securityAlertCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM security_events
    WHERE workspace_id = ? AND risk_level IN ('HIGH', 'CRITICAL')
      AND timestamp >= datetime('now', '-7 days')
  `).get(workspaceId) as { c: number }).c;

  return {
    project_count: projectCount,
    active_project_count: activeProjectCount,
    team_count: teamCount,
    member_count: memberCount,
    pending_approval_count: pendingApprovalCount,
    pending_team_request_count: pendingTeamRequestCount,
    security_alert_count: securityAlertCount,
  };
}

export { resolveProjectAccess };
