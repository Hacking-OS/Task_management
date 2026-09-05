import { Router, Request } from "express";
import { db } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requireWorkspacePerm, requireWorkspaceOwner } from "../middleware/workspaceAuth.js";
import { approvalRateLimit, inviteRateLimit, teamJoinRateLimit } from "../middleware/rateLimit.js";
import { workspaceIdParam, paramString } from "../utils/params.js";
import * as memberService from "../services/workspaceMembers.js";
import * as roleService from "../services/workspaceRoles.js";
import { listPermissions } from "../services/permissions.js";
import { ActivityLogger } from "../services/activityLogger.js";
import { requirePermission, getMemberContext, requireMembership } from "../services/authorization.js";
import {
  snapshotRoleMemberPermissions,
  syncMembersAfterRolePermissionChange,
  syncMemberPermissionChange,
} from "../services/permissionEvents.js";
import * as approvalService from "../services/approvalFlows.js";
import * as taskService from "../services/tasks.js";
import * as issueService from "../services/issues.js";
import * as subtaskService from "../services/subtasks.js";
import * as statusService from "../services/workspaceStatuses.js";
import * as teamService from "../services/teams.js";
import * as teamJoinService from "../services/teamMembershipRequests.js";
import * as teamAssignmentService from "../services/teamAssignments.js";
import * as projectService from "../services/projects.js";
import { type RolePermissionEntry } from "../services/permissions.js";
import { canDecideApproval } from "../services/permissionResolver.js";
import type { StatusEntityType } from "../services/workspaceStatuses.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// --- Permissions catalog ---
router.get("/permissions/catalog", (_req, res) => {
  res.json({ permissions: listPermissions() });
});

router.get("/permissions", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const matrix = memberService.getWorkspacePermissionMatrix(workspaceId, req.userId!);
    res.json({ roles: matrix, permissions: listPermissions() });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/permissions/me", (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    requireMembership(req.userId!, workspaceId);
    const context = getMemberContext(req.userId!, workspaceId);
    const workspace = db.prepare("SELECT id, name FROM workspaces WHERE id = ?").get(workspaceId) as
      | { id: string; name: string }
      | undefined;
    res.json({
      workspace_id: workspaceId,
      workspace_name: workspace?.name ?? "",
      permissions: context.permissions,
      is_owner: context.is_owner,
      is_creator: context.is_creator,
      role_slug: context.role_slug,
      role_name: context.role_name,
      approval_flows_enabled: approvalService.isApprovalFlowsEnabled(workspaceId),
      approval_decide_permissions: context.approval_decide_permissions,
      can_decide_any_approval: canDecideApproval(req.userId!, workspaceId, "task.delete"),
      security_version: context.security_version,
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Workspace statuses ---
router.get("/statuses", requireWorkspacePerm("task.view"), (req, res) => {
  try {
    const entityType = req.query.entity_type as StatusEntityType | undefined;
    const statuses = statusService.listStatuses(workspaceIdParam(req.params), entityType);
    res.json({ statuses });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/statuses", requireWorkspacePerm("workspace.settings"), (req, res) => {
  try {
    const { entity_type, slug, label, color, sort_order, is_closed } = req.body;
    if (!entity_type || !label || !color) {
      res.status(400).json({ error: "entity_type, label, and color are required" });
      return;
    }
    const status = statusService.createStatus(workspaceIdParam(req.params), entity_type, {
      slug: slug ?? label,
      label,
      color,
      sort_order,
      is_closed,
    });
    res.status(201).json({ status });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/statuses/:statusId", requireWorkspacePerm("workspace.settings"), (req, res) => {
  try {
    const status = statusService.updateStatus(
      workspaceIdParam(req.params),
      paramString(req.params.statusId),
      req.body
    );
    res.json({ status });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/statuses/:statusId", requireWorkspacePerm("workspace.settings"), (req, res) => {
  try {
    statusService.deleteStatus(workspaceIdParam(req.params), paramString(req.params.statusId));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Roles (owner-only management) ---
router.post("/roles", requireWorkspaceOwner(), (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name) {
      res.status(400).json({ error: "Role name is required" });
      return;
    }
    const role = roleService.createRole(workspaceIdParam(req.params), name, permissions ?? []);
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "role_created",
      description: `Created role "${role.name}"`,
      metadata: { role_id: role.id, role_name: role.name },
    });
    res.status(201).json({ role: roleService.getRoleWithPermissions(workspaceIdParam(req.params), role.id) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/roles/:roleId", requireWorkspaceOwner(), (req, res) => {
  try {
    const role = roleService.renameRole(workspaceIdParam(req.params), paramString(req.params.roleId), req.body.name);
    res.json({ role: roleService.getRoleWithPermissions(workspaceIdParam(req.params), role.id) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/roles/:roleId", requireWorkspaceOwner(), (req, res) => {
  try {
    roleService.deleteRole(workspaceIdParam(req.params), paramString(req.params.roleId));
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "role_deleted",
      description: "Deleted a custom role",
      metadata: { role_id: paramString(req.params.roleId) },
    });
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put("/roles/:roleId/permissions", requireWorkspaceOwner(), (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const roleId = paramString(req.params.roleId);
    const { permissions, permission_effects } = req.body as {
      permissions?: string[];
      permission_effects?: RolePermissionEntry[];
    };
    const before = roleService.getRoleWithPermissions(workspaceId, roleId);
    const beforeByUser = snapshotRoleMemberPermissions(workspaceId, roleId);

    let role;
    if (permission_effects && Array.isArray(permission_effects)) {
      role = roleService.updateRolePermissionEffects(workspaceId, roleId, permission_effects);
    } else {
      role = roleService.updateRolePermissions(workspaceId, roleId, permissions ?? []);
    }
    const after = roleService.getRoleWithPermissions(workspaceId, role.id);

    syncMembersAfterRolePermissionChange(workspaceId, roleId, beforeByUser, req.userId!);

    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "permissions_updated",
      description: `Updated permissions for role "${role.name}"`,
      metadata: {
        role_id: role.id,
        role_name: role.name,
        added: (after?.permissions ?? []).filter((p) => !(before?.permissions ?? []).includes(p)),
        removed: (before?.permissions ?? []).filter((p) => !(after?.permissions ?? []).includes(p)),
      },
    });

    res.json({ role: after });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/roles/:roleId/reset", requireWorkspaceOwner(), (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const roleId = paramString(req.params.roleId);
    const beforeByUser = snapshotRoleMemberPermissions(workspaceId, roleId);
    const role = roleService.resetRolePermissions(workspaceId, roleId);
    syncMembersAfterRolePermissionChange(workspaceId, roleId, beforeByUser, req.userId!);
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "permissions_reset",
      description: `Reset permissions for role "${role.name}"`,
      metadata: { role_id: role.id },
    });
    res.json({ role: roleService.getRoleWithPermissions(workspaceIdParam(req.params), role.id) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/roles/:roleId/clone", requireWorkspaceOwner(), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: "New role name is required" });
      return;
    }
    const role = roleService.cloneRole(workspaceIdParam(req.params), paramString(req.params.roleId), name);
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "role_cloned",
      description: `Cloned role as "${role.name}"`,
      metadata: { role_id: role.id, source_role_id: paramString(req.params.roleId) },
    });
    res.status(201).json({ role: roleService.getRoleWithPermissions(workspaceIdParam(req.params), role.id) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Members ---
router.get("/members", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    res.json({ members: memberService.listMembers(workspaceIdParam(req.params), req.userId!) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/members/:memberId", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    res.json({
      member: memberService.getMemberWithPermissions(
        workspaceIdParam(req.params),
        paramString(req.params.memberId),
        req.userId!
      ),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/members/:memberId/role", requireWorkspacePerm("member.change_role"), (req, res) => {
  try {
    const { role_id } = req.body;
    if (!role_id) {
      res.status(400).json({ error: "role_id is required" });
      return;
    }
    const before = memberService.getMemberWithPermissions(workspaceIdParam(req.params), paramString(req.params.memberId));
    const member = memberService.changeMemberRole(
      workspaceIdParam(req.params),
      paramString(req.params.memberId),
      role_id,
      req.userId!
    );
    syncMemberPermissionChange(
      workspaceIdParam(req.params),
      before.user_id,
      before.effective_permissions ?? [],
      req.userId!
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "member_role_changed",
      description: `Changed ${member.username}'s role`,
      metadata: {
        member_id: member.id,
        username: member.username,
        from_role: before.role_name,
        to_role: member.role_name,
      },
    });
    res.json({ member: memberService.getMemberWithPermissions(workspaceIdParam(req.params), member.id) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put("/members/:memberId/permissions", requireWorkspaceOwner(), (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const memberId = paramString(req.params.memberId);
    const { overrides } = req.body as { overrides?: { permission_code: string; effect: "grant" | "deny" }[] };
    const beforeMember = memberService.getMemberWithPermissions(workspaceId, memberId);
    const member = memberService.updateMemberPermissions(
      req.userId!,
      workspaceId,
      memberId,
      overrides ?? []
    );
    syncMemberPermissionChange(
      workspaceId,
      beforeMember.user_id,
      beforeMember.effective_permissions ?? [],
      req.userId!
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "member_permissions_updated",
      description: `Customized permissions for ${member.username}`,
      metadata: { member_id: member.id, username: member.username },
    });
    res.json({ member });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/members/:memberId/permissions/reset", requireWorkspaceOwner(), (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const memberId = paramString(req.params.memberId);
    const beforeMember = memberService.getMemberWithPermissions(workspaceId, memberId);
    const member = memberService.resetMemberPermissions(
      req.userId!,
      workspaceId,
      memberId
    );
    syncMemberPermissionChange(
      workspaceId,
      beforeMember.user_id,
      beforeMember.effective_permissions ?? [],
      req.userId!
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "member_permissions_reset",
      description: `Reset custom permissions for ${member.username}`,
      metadata: { member_id: member.id, username: member.username },
    });
    res.json({ member });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/members/:memberId", requireWorkspacePerm("member.remove"), (req, res) => {
  try {
    const member = memberService.listMembers(workspaceIdParam(req.params)).find((m) => m.id === paramString(req.params.memberId));
    memberService.removeMember(workspaceIdParam(req.params), paramString(req.params.memberId), req.userId!);
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "member_removed",
      description: `Removed ${member?.username ?? "member"} from workspace`,
      metadata: { member_id: paramString(req.params.memberId) },
    });
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Teams ---
router.get("/teams", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    res.json({ teams: teamService.listTeams(workspaceIdParam(req.params)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/teams", requireWorkspacePerm("team.create"), (req, res) => {
  try {
    const { name, description, lead_member_id } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const team = teamService.createTeam(req.userId!, workspaceIdParam(req.params), {
      name,
      description,
      lead_member_id,
    });
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "team_created",
      description: `Created team "${team.name}"`,
      metadata: { team_id: team.id },
    });
    res.status(201).json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/teams/:teamId", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const team = teamService.getTeam(workspaceIdParam(req.params), paramString(req.params.teamId));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/teams/:teamId", requireWorkspacePerm("team.edit"), (req, res) => {
  try {
    const team = teamService.updateTeam(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      req.body
    );
    res.json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/teams/:teamId", requireWorkspacePerm("team.delete"), (req, res) => {
  try {
    teamService.deleteTeam(req.userId!, workspaceIdParam(req.params), paramString(req.params.teamId));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put("/teams/:teamId/lead", (req, res) => {
  try {
    const { member_id } = req.body;
    const team = teamService.setTeamLead(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      member_id ?? null
    );
    res.json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/teams/:teamId/members", (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) {
      res.status(400).json({ error: "member_id is required" });
      return;
    }
    const team = teamService.addTeamMember(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      member_id
    );
    res.json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/teams/:teamId/members/:memberId", (req, res) => {
  try {
    const team = teamService.removeTeamMember(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      paramString(req.params.memberId)
    );
    res.json({ team });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Team join requests ---
router.get("/teams/:teamId/join-requests", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const status = req.query.status as teamJoinService.TeamJoinStatus | undefined;
    const requests = teamJoinService.listTeamJoinRequestsForLead(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      status
    );
    res.json({ requests });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/teams/:teamId/my-join-status", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const status = teamJoinService.getMyTeamJoinStatus(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId)
    );
    res.json(status);
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/teams/:teamId/join-requests", requireWorkspacePerm("team.request_join"), teamJoinRateLimit, (req, res) => {
  try {
    const { reason } = req.body;
    const request = teamJoinService.requestTeamMembership(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId),
      reason ?? ""
    );
    res.status(201).json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/team-join-requests/:requestId/approve", (req, res) => {
  try {
    const request = teamJoinService.approveTeamJoinRequest(req.userId!, paramString(req.params.requestId));
    res.json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/team-join-requests/:requestId/reject", (req, res) => {
  try {
    const { reason } = req.body;
    const request = teamJoinService.rejectTeamJoinRequest(req.userId!, paramString(req.params.requestId), reason ?? "");
    res.json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/team-join-requests/mine", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const requests = teamJoinService.listMyTeamJoinRequests(req.userId!, workspaceIdParam(req.params));
    res.json({ requests });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Workspace overview (owner dashboard aggregates) ---
router.get("/overview", requireWorkspacePerm("workspace.view"), (req, res) => {
  try {
    const overview = projectService.getWorkspaceOverview(req.userId!, workspaceIdParam(req.params));
    res.json({ overview });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Member management summary ---
router.get("/members/:memberId/summary", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    const summary = projectService.getMemberManagementSummary(
      workspaceIdParam(req.params),
      paramString(req.params.memberId)
    );
    if (!summary) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json({ summary });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Projects ---
router.get("/projects", (req, res) => {
  try {
    const status = req.query.status as projectService.ProjectStatus | undefined;
    const search = req.query.search as string | undefined;
    const projects = projectService.listProjectSummaries(req.userId!, workspaceIdParam(req.params), { status, search });
    res.json({ projects });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/projects", (req, res) => {
  try {
    const { name, description, lead_member_id } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const project = projectService.createProject(req.userId!, workspaceIdParam(req.params), {
      name,
      description,
      lead_member_id: lead_member_id ?? null,
    });
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_created",
      description: `Created project "${project.name}"`,
      metadata: { project_id: project.id },
    });
    res.status(201).json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/projects/:projectId", (req, res) => {
  try {
    const project = projectService.getProject(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/projects/:projectId", (req, res) => {
  try {
    const project = projectService.updateProject(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId),
      req.body
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_updated",
      description: `Updated project "${project.name}"`,
      metadata: { project_id: project.id },
    });
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/projects/:projectId", (req, res) => {
  try {
    const workspaceId = workspaceIdParam(req.params);
    const projectId = paramString(req.params.projectId);
    const existing = projectService.getProject(req.userId!, workspaceId, projectId);
    projectService.deleteProject(req.userId!, workspaceId, projectId);
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      action: "project_deleted",
      description: `Deleted project "${existing?.name ?? projectId}"`,
      metadata: { project_id: projectId },
    });
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put("/projects/:projectId/teams", (req, res) => {
  try {
    const { team_ids } = req.body as { team_ids?: string[] };
    const project = projectService.setProjectTeams(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId),
      team_ids ?? []
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_teams_updated",
      description: `Updated teams for project "${project.name}"`,
      metadata: { project_id: project.id, team_ids: team_ids ?? [] },
    });
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/projects/:projectId/members", (req, res) => {
  try {
    const { member_id, role_in_project } = req.body;
    if (!member_id) {
      res.status(400).json({ error: "member_id is required" });
      return;
    }
    const project = projectService.addProjectMember(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId),
      member_id,
      role_in_project ?? "member"
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_member_added",
      description: `Added member to project "${project.name}"`,
      metadata: { project_id: project.id, member_id },
    });
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/projects/:projectId/members/:memberId", (req, res) => {
  try {
    const project = projectService.removeProjectMember(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId),
      paramString(req.params.memberId)
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_member_removed",
      description: `Removed member from project "${project.name}"`,
      metadata: { project_id: project.id, member_id: paramString(req.params.memberId) },
    });
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put("/projects/:projectId/lead", (req, res) => {
  try {
    const { member_id } = req.body;
    const project = projectService.setProjectLead(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.projectId),
      member_id ?? null
    );
    ActivityLogger.log({
      userId: req.userId!,
      workspaceId: workspaceIdParam(req.params),
      entityType: "workspace",
      entityId: workspaceIdParam(req.params),
      action: "project_lead_changed",
      description: `Changed lead for project "${project.name}"`,
      metadata: { project_id: project.id, member_id: member_id ?? null },
    });
    res.json({ project });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/teams/:teamId/projects", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const projects = projectService.listProjectsForTeam(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.teamId)
    );
    res.json({ projects });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Team assignments ---
router.get("/team-assignments", requireWorkspacePerm("team.view"), (req, res) => {
  try {
    const entityType = req.query.entity_type as teamAssignmentService.TeamEntityType | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const teamId = req.query.team_id as string | undefined;
    const workspaceId = workspaceIdParam(req.params);

    if (entityType && entityId) {
      res.json({ assignments: teamAssignmentService.listTeamAssignmentsForEntity(workspaceId, entityType, entityId) });
      return;
    }
    if (teamId) {
      res.json({ assignments: teamAssignmentService.listTeamAssignmentsForTeam(workspaceId, teamId) });
      return;
    }
    res.status(400).json({ error: "entity_type+entity_id or team_id required" });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/team-assignments", (req, res) => {
  try {
    const { team_id, entity_type, entity_id } = req.body;
    if (!team_id || !entity_type || !entity_id) {
      res.status(400).json({ error: "team_id, entity_type, and entity_id are required" });
      return;
    }
    const assignment = teamAssignmentService.assignTeamToEntity(
      req.userId!,
      workspaceIdParam(req.params),
      team_id,
      entity_type,
      entity_id
    );
    res.status(201).json({ assignment });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/team-assignments", (req, res) => {
  try {
    const { team_id, entity_type, entity_id } = req.body;
    if (!team_id || !entity_type || !entity_id) {
      res.status(400).json({ error: "team_id, entity_type, and entity_id are required" });
      return;
    }
    teamAssignmentService.removeTeamFromEntity(
      req.userId!,
      workspaceIdParam(req.params),
      team_id,
      entity_type,
      entity_id
    );
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Invitations ---
router.get("/invitations", requireWorkspaceOwner(), (req, res) => {
  try {
    res.json({ invitations: memberService.listInvitations(workspaceIdParam(req.params)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/invitations", requireWorkspaceOwner(), inviteRateLimit, (req, res) => {
  try {
    const { email, role_id } = req.body;
    if (!email || !role_id) {
      res.status(400).json({ error: "email and role_id are required" });
      return;
    }
    const invitation = memberService.createInvitation(req.userId!, workspaceIdParam(req.params), email, role_id);
    res.status(201).json({ invitation });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/invitations/:invitationId/resend", requireWorkspaceOwner(), (req, res) => {
  try {
    const invitation = memberService.resendInvitation(req.userId!, workspaceIdParam(req.params), paramString(req.params.invitationId));
    res.json({ invitation });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/invitations/:invitationId/revoke", requireWorkspacePerm("member.invite"), (req, res) => {
  try {
    memberService.revokeInvitation(req.userId!, workspaceIdParam(req.params), paramString(req.params.invitationId));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Approval flows ---
router.get("/approvals/pending", (req, res) => {
  try {
    const requests = approvalService.listPendingApprovalsForDecider(req.userId!, workspaceIdParam(req.params));
    res.json({ requests });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/approvals", (req, res) => {
  try {
    const status = req.query.status as approvalService.ApprovalStatus | undefined;
    const mine = req.query.mine === "true";
    const requests = approvalService.listAllApprovals(req.userId!, workspaceIdParam(req.params), { status, mine });
    res.json({ requests });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/approvals/mine", (req, res) => {
  try {
    const requests = approvalService.listMyApprovalRequests(req.userId!, workspaceIdParam(req.params));
    res.json({ requests });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/approvals", approvalRateLimit, (req, res) => {
  try {
    const { permission_code, title, description } = req.body;
    if (!permission_code) {
      res.status(400).json({ error: "permission_code is required" });
      return;
    }
    const request = approvalService.createApprovalRequest(
      req.userId!,
      workspaceIdParam(req.params),
      permission_code,
      title ?? `Permission request: ${permission_code}`,
      description ?? ""
    );
    res.status(201).json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/approvals/:requestId/approve", approvalRateLimit, (req, res) => {
  try {
    const request = approvalService.approveRequest(req.userId!, paramString(req.params.requestId));
    res.json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/approvals/:requestId/reject", approvalRateLimit, (req, res) => {
  try {
    const { note } = req.body;
    const request = approvalService.rejectRequest(req.userId!, paramString(req.params.requestId), note ?? "");
    res.json({ request });
  } catch (error) {
    handleServiceError(res, error);
  }
});

// --- Workspace-scoped tasks/issues/subtasks ---
router.get("/tasks", requireWorkspacePerm("task.view"), (req, res) => {
  try {
    const severity = req.query.severity as import("../types.js").Severity | undefined;
    res.json({ tasks: taskService.listTasksInWorkspace(req.userId!, workspaceIdParam(req.params), severity) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/tasks", requireWorkspacePerm("task.create"), (req, res) => {
  try {
    const task = taskService.createTaskInWorkspace(req.userId!, workspaceIdParam(req.params), req.body);
    res.status(201).json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/issues", requireWorkspacePerm("issue.view"), (req, res) => {
  try {
    const severity = req.query.severity as import("../types.js").Severity | undefined;
    res.json({ issues: issueService.listIssuesInWorkspace(req.userId!, workspaceIdParam(req.params), severity) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/issues", requireWorkspacePerm("issue.create"), (req, res) => {
  try {
    const issue = issueService.createIssueInWorkspace(req.userId!, workspaceIdParam(req.params), req.body);
    res.status(201).json({ issue });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/subtasks", requireWorkspacePerm("subtask.view"), (req, res) => {
  try {
    res.json({
      subtasks: subtaskService.listSubtasksInWorkspace(req.userId!, workspaceIdParam(req.params), {
        task_id: req.query.task_id as string | undefined,
        issue_id: req.query.issue_id as string | undefined,
        severity: req.query.severity as import("../types.js").Severity | undefined,
      }),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/subtasks", requireWorkspacePerm("subtask.create"), (req, res) => {
  try {
    const subtask = subtaskService.createSubtaskInWorkspace(req.userId!, workspaceIdParam(req.params), req.body);
    res.status(201).json({ subtask });
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;

// Accept/reject invitations (user-scoped, not workspace-scoped)
export const invitationRouter = Router();

invitationRouter.get("/preview/:token", (req, res) => {
  try {
    const preview = memberService.getInvitationPreview(paramString(req.params.token));
    res.json({ preview });
  } catch (error) {
    handleServiceError(res, error);
  }
});

invitationRouter.use(authMiddleware);

invitationRouter.get("/mine", (req, res) => {
  try {
    const invitations = memberService.listMyPendingInvitations(req.userId!);
    res.json({ invitations });
  } catch (error) {
    handleServiceError(res, error);
  }
});

invitationRouter.post("/accept", (req, res) => {
  try {
    const ref = (req.body.token ?? req.body.code) as string | undefined;
    if (!ref) {
      res.status(400).json({ error: "token or code is required" });
      return;
    }
    const result = memberService.acceptInvitation(req.userId!, ref);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error);
  }
});

invitationRouter.post("/reject", (req, res) => {
  try {
    const ref = (req.body.token ?? req.body.code) as string | undefined;
    if (!ref) {
      res.status(400).json({ error: "token or code is required" });
      return;
    }
    memberService.rejectInvitation(req.userId!, ref);
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});
