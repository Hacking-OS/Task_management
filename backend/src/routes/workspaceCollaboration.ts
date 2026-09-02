import { Router, Request } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requireWorkspacePerm, requireWorkspaceOwner } from "../middleware/workspaceAuth.js";
import { workspaceIdParam, paramString } from "../utils/params.js";
import * as memberService from "../services/workspaceMembers.js";
import * as roleService from "../services/workspaceRoles.js";
import { listPermissions } from "../services/permissions.js";
import { ActivityLogger } from "../services/activityLogger.js";
import { requirePermission, getMemberContext, requireMembership } from "../services/authorization.js";
import * as taskService from "../services/tasks.js";
import * as issueService from "../services/issues.js";
import * as subtaskService from "../services/subtasks.js";
import * as statusService from "../services/workspaceStatuses.js";
import * as teamService from "../services/teams.js";
import type { StatusEntityType } from "../services/workspaceStatuses.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// --- Permissions catalog ---
router.get("/permissions/catalog", (_req, res) => {
  res.json({ permissions: listPermissions() });
});

router.get("/permissions", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    const matrix = memberService.getWorkspacePermissionMatrix(workspaceIdParam(req.params));
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
    res.json({
      permissions: context.permissions,
      is_owner: context.is_owner,
      is_creator: context.is_creator,
      role_slug: context.role_slug,
      role_name: context.role_name,
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
    const { permissions } = req.body;
    const before = roleService.getRoleWithPermissions(workspaceIdParam(req.params), paramString(req.params.roleId));
    const role = roleService.updateRolePermissions(workspaceIdParam(req.params), paramString(req.params.roleId), permissions ?? []);
    const after = roleService.getRoleWithPermissions(workspaceIdParam(req.params), role.id);

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
    const role = roleService.resetRolePermissions(workspaceIdParam(req.params), paramString(req.params.roleId));
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
    res.json({ members: memberService.listMembers(workspaceIdParam(req.params)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/members/:memberId", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    res.json({ member: memberService.getMemberWithPermissions(workspaceIdParam(req.params), paramString(req.params.memberId)) });
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
    const { overrides } = req.body as { overrides?: { permission_code: string; effect: "grant" | "deny" }[] };
    const member = memberService.updateMemberPermissions(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.memberId),
      overrides ?? []
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
    const member = memberService.resetMemberPermissions(
      req.userId!,
      workspaceIdParam(req.params),
      paramString(req.params.memberId)
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

// --- Invitations ---
router.get("/invitations", requireWorkspacePerm("member.view"), (req, res) => {
  try {
    res.json({ invitations: memberService.listInvitations(workspaceIdParam(req.params)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/invitations", requireWorkspacePerm("member.invite"), (req, res) => {
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

router.post("/invitations/:invitationId/resend", requireWorkspacePerm("member.invite"), (req, res) => {
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
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    const result = memberService.acceptInvitation(req.userId!, token);
    res.json(result);
  } catch (error) {
    handleServiceError(res, error);
  }
});

invitationRouter.post("/reject", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }
    memberService.rejectInvitation(req.userId!, token);
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});
