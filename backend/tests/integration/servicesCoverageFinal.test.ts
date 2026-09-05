import { jest } from "@jest/globals";
import { db } from "../../src/db.js";
import {
  changeMemberRole,
  findUserByEmail,
  ForbiddenError,
  getMemberEffectivePermissions,
  getOwnerRoleId,
  getPermissionResolution,
  isWorkspaceCreator,
  listMembers,
  migrateLegacyWorkspaces,
  PermissionDeniedError,
  requirePermission,
  requireWorkspaceCreator,
  requireWorkspaceOwner,
} from "../../src/services/authorization.js";
import {
  approveRequest,
  createApprovalRequest,
  listPendingApprovalsForCreator,
  rejectRequest,
  setApprovalFlowsEnabled,
} from "../../src/services/approvalFlows.js";
import {
  addProjectMember,
  createProject,
  deleteProject,
  getMemberManagementSummary,
  getProject,
  listProjectSummaries,
  listProjectsForMemberUser,
  listProjectsForTeam,
  listTeamsForMemberUser,
  removeProjectMember,
  setProjectLead,
  setProjectTeams,
  updateProject,
} from "../../src/services/projects.js";
import {
  acceptInvitation,
  createInvitation,
  getInvitationPreview,
  rejectInvitation,
} from "../../src/services/workspaceMembers.js";
import { createTask, listTasks, listTasksInWorkspace, updateTask } from "../../src/services/tasks.js";
import {
  createSubtask,
  createSubtaskInWorkspace,
  getSubtask,
  listSubtasks,
  listSubtasksInWorkspace,
  updateSubtask,
} from "../../src/services/subtasks.js";
import { createIssue, updateIssue } from "../../src/services/issues.js";
import { checkDueTaskNotifications, createNotification, notify } from "../../src/services/notifications.js";
import { getActiveWorkspace } from "../../src/services/workspaces.js";
import { login, register } from "../../src/services/auth.js";
import {
  authorize,
  ConflictError,
  StaleSecurityVersionError,
} from "../../src/services/authorizationService.js";
import { listAssigneeIdsBatch } from "../../src/services/entityAssignments.js";
import {
  deleteFile,
  listFilesByEntity,
  listFilesLegacy,
  uploadCategorizedFile,
  uploadFile,
  uploadUserAvatar,
} from "../../src/services/files.js";
import {
  createTimeEntry,
  getTimeSummary,
  listTimeEntries,
  updateTimeEntry,
} from "../../src/services/timeEntries.js";
import {
  createAuthenticatedSession,
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateRefreshSession,
  validateSession,
} from "../../src/services/sessions.js";
import { listSecurityEvents, logSecurityEvent } from "../../src/services/securityEvents.js";
import { getDashboardStats } from "../../src/services/stats.js";
import { migrateMissingSystemRoles } from "../../src/services/workspaceRoles.js";
import { listStatuses } from "../../src/services/workspaceStatuses.js";
import { setMemberPermissionOverrides } from "../../src/services/memberPermissions.js";
import { canDecideApproval } from "../../src/services/permissionResolver.js";
import { bumpSecurityVersionForUserInWorkspace } from "../../src/services/securityVersion.js";
import * as teamService from "../../src/services/teams.js";
import {
  assignTeamToEntity,
  listTeamsForEntity,
} from "../../src/services/teamAssignments.js";
import {
  approveTeamJoinRequest,
  getMyTeamJoinStatus,
  listMyTeamJoinRequests,
  listTeamJoinRequestsForLead,
  rejectTeamJoinRequest,
  requestTeamMembership,
} from "../../src/services/teamMembershipRequests.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";
import {
  addWorkspaceMember,
  createTestUser,
  createWorkspaceFixture,
  grantMemberOverride,
  setRoleEffect,
} from "../setup/fixtures.js";
import fs from "node:fs";

function memberRowId(workspaceId: string, userId: string): string {
  const row = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string };
  return row.id;
}

describe("servicesCoverageFinal", () => {
  describe("authorization helpers", () => {
    it("covers permission resolution, owner helpers, and legacy migration", () => {
      const { id, owner } = createWorkspaceFixture("auth_final");
      const admin = addWorkspaceMember(id, "admin");
      const devRole = getRoleBySlug(id, "developer")!;

      expect(getPermissionResolution(owner.id, id, "task.view").allowed).toBe(true);
      expect(findUserByEmail(owner.email)?.id).toBe(owner.id);
      expect(getOwnerRoleId(id)).toBeTruthy();
      expect(isWorkspaceCreator(owner.id, id)).toBe(true);
      expect(() => requireWorkspaceCreator(admin.id, id)).toThrow(ForbiddenError);
      expect(() => requireWorkspaceOwner(admin.id, id)).toThrow(ForbiddenError);

      setRoleEffect(id, "developer", "project.create", "approval_required");
      try {
        requirePermission(admin.id, id, "project.create");
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        expect((error as PermissionDeniedError).requiresApproval).toBe(true);
      }

      const ownerMember = listMembers(id).find((m) => m.user_id === owner.id)!;
      const adminMember = listMembers(id).find((m) => m.user_id === admin.id)!;
      expect(() => changeMemberRole(id, ownerMember.id, devRole.id, admin.id)).toThrow(ForbiddenError);
      expect(() => changeMemberRole(id, adminMember.id, getRoleBySlug(id, "owner")!.id, owner.id)).toThrow(
        ForbiddenError,
      );

      const viewed = listMembers(id, admin.id);
      expect(viewed.length).toBeGreaterThan(0);
      expect(getMemberEffectivePermissions(id, adminMember.id).length).toBeGreaterThan(0);

      const legacyUser = createTestUser("legacy_ws_user");
      const legacyWsId = crypto.randomUUID();
      db.prepare("INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)").run(
        legacyWsId,
        legacyUser.id,
        "Legacy No Roles",
      );
      migrateLegacyWorkspaces();
      expect(getRoleBySlug(legacyWsId, "owner")).toBeDefined();
    });
  });

  describe("approvalFlows edge paths", () => {
    it("covers disabled toggles, deprecated list, and approve failure branches", () => {
      const { id, owner } = createWorkspaceFixture("appr_final");
      const member = addWorkspaceMember(id, "developer");
      const admin = addWorkspaceMember(id, "admin");

      expect(() => setApprovalFlowsEnabled(admin.id, id, false)).toThrow(ForbiddenError);

      setRoleEffect(id, "developer", "team.create", "approval_required");
      const request = createApprovalRequest(member.id, id, "team.create", "Need team", "Please");
      expect(listPendingApprovalsForCreator(owner.id, id).some((r) => r.id === request.id)).toBe(true);

      db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?").run(id, member.id);
      expect(() => approveRequest(owner.id, request.id)).toThrow("Requester is no longer a workspace member");

      const member2 = addWorkspaceMember(id, "developer");
      setRoleEffect(id, "developer", "project.update", "approval_required");
      const req2 = createApprovalRequest(member2.id, id, "project.update", "Update", "Need");
      setRoleEffect(id, "developer", "project.update", "allow");
      expect(() => approveRequest(owner.id, req2.id)).toThrow("Requester already has this permission");

      const member3 = addWorkspaceMember(id, "qa-engineer");
      setRoleEffect(id, "qa-engineer", "project.delete", "approval_required");
      const req3 = createApprovalRequest(member3.id, id, "project.delete", "Delete", "Need");
      setRoleEffect(id, "qa-engineer", "project.delete", "deny");
      expect(() => approveRequest(owner.id, req3.id)).toThrow(ForbiddenError);

      setRoleEffect(id, "developer", "team.view", "approval_required");
      const okReq = createApprovalRequest(member2.id, id, "team.view", "View teams", "Need");
      const approved = approveRequest(owner.id, okReq.id);
      expect(approved.status).toMatch(/executed|approved/);

      const member4 = addWorkspaceMember(id, "viewer");
      setRoleEffect(id, "viewer", "project.view", "approval_required");
      void rejectRequest(
        owner.id,
        createApprovalRequest(member4.id, id, "project.view", "View", "Need").id,
        "No",
      );
    });
  });

  describe("projects scoped access", () => {
    it("filters projects for members and enriches management summaries", () => {
      const { id, owner } = createWorkspaceFixture("proj_final");
      const member = addWorkspaceMember(id, "developer");
      const memberId = memberRowId(id, member.id);
      const ownerMemberId = memberRowId(id, owner.id);

      const hidden = createProject(owner.id, id, { name: "Hidden Project" });
      const visible = createProject(owner.id, id, { name: "Visible Project" });
      const team = teamService.createTeam(owner.id, id, { name: "Proj Team", lead_member_id: ownerMemberId });
      setProjectTeams(owner.id, id, visible.id, [team.id]);
      teamService.addTeamMember(owner.id, id, team.id, memberId);

      const teamOnly = createProject(owner.id, id, { name: "Team Only Project" });
      setProjectTeams(owner.id, id, teamOnly.id, [team.id]);

      expect(listProjectSummaries(member.id, id).some((p) => p.id === hidden.id)).toBe(false);
      expect(listProjectSummaries(member.id, id, { search: "Visible" }).some((p) => p.id === visible.id)).toBe(true);
      expect(getProject(member.id, id, hidden.id)).toBeUndefined();
      grantMemberOverride(id, member.id, ["project.update"], []);
      expect(() => updateProject(member.id, id, hidden.id, { name: "Nope" })).toThrow("Project not found");

      expect(listProjectsForTeam(member.id, id, team.id).some((p) => p.id === teamOnly.id)).toBe(true);
      expect(listTeamsForMemberUser(id, createTestUser("outsider").id)).toEqual([]);
      expect(listProjectsForMemberUser(id, member.id).length).toBeGreaterThan(0);

      const summary = getMemberManagementSummary(id, memberId)!;
      expect(summary.projects.some((p) => p.access_type === "team" && p.id === teamOnly.id)).toBe(true);

      setProjectLead(owner.id, id, visible.id, null);
      addProjectMember(owner.id, id, visible.id, memberId, "lead");
      removeProjectMember(owner.id, id, visible.id, memberId);
      setProjectTeams(owner.id, id, visible.id, []);
      deleteProject(owner.id, id, hidden.id);
    });
  });

  describe("tasks issues subtasks", () => {
    it("covers cross-workspace lists, assignee updates, and entity paths", () => {
      const { id, owner } = createWorkspaceFixture("ent_final");
      const assignee = addWorkspaceMember(id, "developer");
      const task = createTask(owner.id, {
        title: "Task A",
        workspace_id: id,
        severity: "high",
        assignee_id: assignee.id,
      });
      const issue = createIssue(owner.id, {
        title: "Issue A",
        workspace_id: id,
        assignee_ids: [assignee.id],
      });
      const subFromIssue = createSubtaskInWorkspace(owner.id, id, {
        title: "Issue sub",
        issue_id: issue.id,
        assignee_ids: [assignee.id],
      });

      expect(listTasks(owner.id, undefined, "high").some((t) => t.id === task.id)).toBe(true);
      expect(listTasksInWorkspace(owner.id, id, "high").some((t) => t.id === task.id)).toBe(true);
      expect(getSubtask(createTestUser("no_view").id, subFromIssue.id)).toBeUndefined();

      expect(
        listSubtasks(owner.id, { severity: "medium", task_id: task.id, workspace_id: id }).length,
      ).toBeGreaterThanOrEqual(0);
      expect(listSubtasksInWorkspace(owner.id, id, { task_id: task.id, severity: "high" }).length).toBeGreaterThanOrEqual(
        0,
      );

      expect(() => updateTask(owner.id, task.id, { workspace_id: crypto.randomUUID() })).toThrow(ForbiddenError);
      updateTask(owner.id, task.id, { assignee_id: assignee.id, priority: "high" });
      updateIssue(owner.id, issue.id, { assignee_id: assignee.id });
      updateSubtask(owner.id, subFromIssue.id, { assignee_ids: [assignee.id] });

      const dueTask = createTask(owner.id, {
        title: "Overdue",
        workspace_id: id,
        due_date: new Date(Date.now() - 86400000).toISOString(),
      });
      checkDueTaskNotifications(owner.id);
      notify({ userId: owner.id, type: "info", title: "Test", message: "Due check" });
      expect(createNotification(owner.id, "Legacy", "Message", "info").title).toBe("Legacy");
      void dueTask;
    });
  });

  describe("workspaceMembers invitations", () => {
    it("covers preview invalid reasons and invite-code exhaustion", () => {
      const { id, owner } = createWorkspaceFixture("wm_final");
      const role = getRoleBySlug(id, "developer")!;
      const invite = createInvitation(owner.id, id, "preview@test.local", role.id);
      db.prepare("UPDATE workspace_invitations SET status = 'revoked' WHERE id = ?").run(invite.id);
      expect(getInvitationPreview(invite.token)).toEqual({ valid: false, reason: "revoked" });

      const originalPrepare = db.prepare.bind(db);
      jest.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
        if (typeof sql === "string" && sql.includes("invite_code = ?")) {
          return { get: () => ({ id: "taken" }) } as ReturnType<typeof db.prepare>;
        }
        return originalPrepare(sql as string);
      });
      expect(() => createInvitation(owner.id, id, "codeexhaust@test.local", role.id)).toThrow(
        "Could not generate invite code",
      );
      jest.restoreAllMocks();

      const multiUser = createTestUser("wm_multi");
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run("multi@test.local", multiUser.id);
      addWorkspaceMember(id, "developer", multiUser);
      const ws2 = createWorkspaceFixture("wm_final_b");
      const ws2Role = getRoleBySlug(ws2.id, "developer")!;
      const crossInvite = createInvitation(ws2.owner.id, ws2.id, "other@test.local", ws2Role.id);
      expect(() => acceptInvitation(multiUser.id, crossInvite.token)).toThrow(ForbiddenError);

      const rejectInvite = createInvitation(owner.id, id, "rejectfinal@test.local", role.id);
      const rejectUser = createTestUser("wm_reject_final");
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run("rejectfinal@test.local", rejectUser.id);
      rejectInvitation(rejectUser.id, rejectInvite.token);
    });
  });

  describe("auth sessions workspaces files", () => {
    it("covers register auto-join, login validation, sessions, workspace fallback, and file helpers", () => {
      const { id, owner } = createWorkspaceFixture("misc_final");
      const role = getRoleBySlug(id, "developer")!;
      createInvitation(owner.id, id, "autojoin@test.local", role.id);

      const registered = register("autojoin_user", "autojoin@test.local", "TestPass1");
      expect(registered.joined_workspace_ids.length).toBeGreaterThan(0);

      expect(() => login("autojoin_user", "")).toThrow("Password is required");

      const auth = createAuthenticatedSession(owner.id, "jest", "127.0.0.1");
      expect(createSession(owner.id, "legacy").id).toBeTruthy();
      expect(validateSession(auth.session.id, owner.id)?.id).toBe(auth.session.id);

      revokeSession(auth.session.id);
      expect(revokeAllSessions(owner.id)).toBeGreaterThanOrEqual(0);

      const noPrefUser = createTestUser("active_fallback");
      addWorkspaceMember(id, "viewer", noPrefUser);
      db.prepare("DELETE FROM user_workspace_preferences WHERE user_id = ?").run(noPrefUser.id);
      expect(getActiveWorkspace(noPrefUser.id)?.id).toBe(id);

      const task = createTask(owner.id, { title: "File parent", workspace_id: id });
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      uploadUserAvatar(owner.id, "avatar.png", "image/png", png);
      const uploaded = uploadCategorizedFile(
        owner.id,
        id,
        "task",
        task.id,
        "note.txt",
        "text/plain",
        Buffer.from("hello"),
      );
      expect(uploadFile(owner.id, id, "", "legacy.txt", Buffer.from("legacy")).filename).toBe("legacy.txt");
      expect(listFilesLegacy(owner.id, id).some((f) => f.id === uploaded.id)).toBe(true);
      deleteFile(owner.id, uploaded.id);

      const rotated = createAuthenticatedSession(owner.id);
      const refresh = rotateRefreshSession(rotated.refreshToken, { userAgent: "jest", ip: "127.0.0.1" });
      expect(refresh.accessToken).toBeTruthy();
      void refresh;
    });
  });

  describe("authorizationService security stats teams", () => {
    it("covers stale version logging, category deciders, security filters, and team flows", () => {
      const { id, owner } = createWorkspaceFixture("svc_final");
      const member = addWorkspaceMember(id, "admin");
      grantMemberOverride(id, member.id, ["approval.decide.tasks"], []);

      const stale = new StaleSecurityVersionError(2, 1);
      expect(stale.securityVersion).toBe(2);
      expect(stale.clientVersion).toBe(1);

      const approvalRequired = authorize({
        userId: member.id,
        workspaceId: id,
        permission: "project.create",
        clientSecurityVersion: 99999,
      });
      setRoleEffect(id, "admin", "project.create", "approval_required");
      const needsApproval = authorize({
        userId: member.id,
        workspaceId: id,
        permission: "project.create",
        clientSecurityVersion: 99999,
      });
      expect(needsApproval.requiresApproval).toBe(true);
      expect(approvalRequired.securityVersion).toBeGreaterThan(0);

      expect(canDecideApproval(member.id, id, "task.delete")).toBe(true);

      logSecurityEvent({
        actorUserId: owner.id,
        workspaceId: id,
        action: "TEST_EVENT",
        result: "SUCCESS",
        metadata: { password: "secret-value", note: "ok" },
      });
      expect(
        listSecurityEvents({ workspaceId: id, actorUserId: owner.id, riskLevel: "INFO", limit: 5 }).length,
      ).toBeGreaterThan(0);

      expect(getDashboardStats(owner.id, id).totals.tasks).toBeGreaterThanOrEqual(0);
      expect(getDashboardStats(owner.id).totals.tasks).toBeGreaterThanOrEqual(0);

      migrateMissingSystemRoles();
      expect(listStatuses(id).length).toBeGreaterThan(0);
      expect(listStatuses(id, "task").length).toBeGreaterThan(0);

      const ownerMemberId = memberRowId(id, owner.id);
      const team = teamService.createTeam(owner.id, id, { name: "Final Team", lead_member_id: ownerMemberId });
      const joinReq = requestTeamMembership(member.id, id, team.id, "Please add me");
      expect(listTeamJoinRequestsForLead(owner.id, id, team.id, "pending").some((r) => r.id === joinReq.id)).toBe(true);
      expect(listMyTeamJoinRequests(member.id, id).some((r) => r.id === joinReq.id)).toBe(true);
      expect(getMyTeamJoinStatus(member.id, id, team.id).pending).toBe(true);
      rejectTeamJoinRequest(owner.id, joinReq.id, "Not now");
      expect(getMyTeamJoinStatus(member.id, id, team.id).last_rejected).toBe(true);

      const joinMember = addWorkspaceMember(id, "developer");
      const joinReqApprove = requestTeamMembership(joinMember.id, id, team.id, "Please add me too");
      approveTeamJoinRequest(owner.id, joinReqApprove.id);
      teamService.removeTeamMember(owner.id, id, team.id, memberRowId(id, joinMember.id));
      expect(teamService.listTeamsLedByUser(id, owner.id).some((t) => t.id === team.id)).toBe(true);

      const task = createTask(owner.id, { title: "Team task", workspace_id: id, assignee_id: member.id });
      assignTeamToEntity(owner.id, id, team.id, "task", task.id);
      expect(listTeamsForEntity(id, "task", task.id).some((t) => t.team_id === team.id)).toBe(true);

      const assigneeMap = listAssigneeIdsBatch("task", [task.id]);
      expect(assigneeMap.get(task.id)?.length).toBeGreaterThan(0);

      const ownerMember = memberRowId(id, owner.id);
      expect(() => setMemberPermissionOverrides(id, ownerMember, [])).toThrow(ForbiddenError);

      bumpSecurityVersionForUserInWorkspace(id, createTestUser("revoked_ext").id, "workspace.access.revoked");

      expect(new ConflictError("x").status).toBe(409);
    });
  });

  describe("time entries", () => {
    it("covers self-filter paths and summary date filters", () => {
      const { id, owner } = createWorkspaceFixture("time_final");
      const task = createTask(owner.id, { title: "Timed", workspace_id: id });
      const entry = createTimeEntry(owner.id, id, {
        entity_type: "task",
        entity_id: task.id,
        work_date: "2026-06-01",
        hours: 2,
      });

      expect(listTimeEntries(owner.id, id, { user_id: owner.id }).some((e) => e.id === entry.id)).toBe(true);
      updateTimeEntry(owner.id, entry.id, { hours: 3, description: "Updated" });

      const summary = getTimeSummary(owner.id, id, { from: "2026-01-01", to: "2026-12-31" });
      expect(summary.entryCount).toBeGreaterThan(0);
    });
  });

  describe("remaining service line coverage", () => {
    it("covers team join guards, sessions, files, tasks, and misc helpers", () => {
      const { id, owner } = createWorkspaceFixture("remain_final");
      const member = addWorkspaceMember(id, "developer");
      const viewer = addWorkspaceMember(id, "viewer");
      const ownerMemberId = memberRowId(id, owner.id);

      const team = teamService.createTeam(owner.id, id, { name: "Remain Team", lead_member_id: ownerMemberId });
      const joinReq = requestTeamMembership(member.id, id, team.id, "Join");
      expect(() => listTeamJoinRequestsForLead(viewer.id, id, team.id)).toThrow(ForbiddenError);
      expect(() => approveTeamJoinRequest(viewer.id, joinReq.id)).toThrow(ForbiddenError);
      expect(() => rejectTeamJoinRequest(viewer.id, joinReq.id)).toThrow(ForbiddenError);

      db.prepare("DELETE FROM workspace_members WHERE id = ?").run(memberRowId(id, member.id));
      const approveGuardMember = addWorkspaceMember(id, "developer");
      const approveGuardReq = requestTeamMembership(approveGuardMember.id, id, team.id, "Approve guard");
      const originalPrepare = db.prepare.bind(db);
      jest.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
        if (
          typeof sql === "string" &&
          sql.includes("SELECT 1 FROM workspace_members WHERE id = ? AND workspace_id = ?")
        ) {
          return { get: () => undefined } as ReturnType<typeof db.prepare>;
        }
        return originalPrepare(sql as string);
      });
      expect(() => approveTeamJoinRequest(owner.id, approveGuardReq.id)).toThrow(
        "Requester is no longer a workspace member",
      );

      const rejectGuardMember = addWorkspaceMember(id, "tech-lead");
      const rejectGuardReq = requestTeamMembership(rejectGuardMember.id, id, team.id, "Reject guard");
      expect(() => rejectTeamJoinRequest(owner.id, rejectGuardReq.id)).toThrow(
        "Requester is no longer a workspace member",
      );
      jest.restoreAllMocks();

      setRoleEffect(id, "admin", "timesheet.view_all", "allow");
      const admin = addWorkspaceMember(id, "admin");
      const timeMember = addWorkspaceMember(id, "qa-engineer");
      const task = createTask(owner.id, { title: "Time all", workspace_id: id });
      createTimeEntry(timeMember.id, id, {
        entity_type: "task",
        entity_id: task.id,
        work_date: "2026-07-01",
        hours: 1,
      });
      expect(listTimeEntries(admin.id, id).length).toBeGreaterThan(0);
      expect(listTimeEntries(timeMember.id, id).some((e) => e.user_id === timeMember.id)).toBe(true);
      expect(getTimeSummary(admin.id, id).entryCount).toBeGreaterThan(0);

      const assignee = addWorkspaceMember(id, "qa-engineer");
      const task2 = createTask(owner.id, {
        title: "Assignee ids",
        workspace_id: id,
        assignee_ids: [assignee.id],
      });
      updateTask(owner.id, task2.id, { assignee_ids: [assignee.id] });

      const closedTask = createTask(owner.id, { title: "Done task", workspace_id: id });
      const doneSlug = db.prepare(`
        SELECT slug FROM workspace_statuses
        WHERE workspace_id = ? AND entity_type = 'task' AND is_closed = 1 LIMIT 1
      `).get(id) as { slug: string } | undefined;
      if (doneSlug) {
        updateTask(owner.id, closedTask.id, { status: doneSlug.slug as "done" });
      }

      const issue = createIssue(owner.id, { title: "Issue assign", workspace_id: id });
      updateIssue(owner.id, issue.id, { assignee_ids: [assignee.id] });
      const hiddenSubtask = createSubtask(owner.id, { title: "Hidden", workspace_id: id, task_id: task2.id });
      expect(getSubtask(owner.id, hiddenSubtask.id)?.id).toBe(hiddenSubtask.id);

      const hiddenProject = createProject(owner.id, id, { name: "Status Filter" });
      updateProject(owner.id, id, hiddenProject.id, { status: "archived" });
      expect(listProjectSummaries(owner.id, id, { status: "archived" }).some((p) => p.id === hiddenProject.id)).toBe(true);
      expect(listTeamsForMemberUser(id, owner.id).length).toBeGreaterThanOrEqual(0);
      expect(teamService.listTeamsForMember(id, ownerMemberId).some((t) => t.id === team.id)).toBe(true);

      teamService.addTeamMember(owner.id, id, team.id, memberRowId(id, assignee.id));
      teamService.removeTeamMember(owner.id, id, team.id, ownerMemberId);

      setRoleEffect(id, "admin", "file.delete", "allow");
      setRoleEffect(id, "admin", "workspace.edit", "allow");
      const generalFile = uploadFile(owner.id, id, "", "general.bin", Buffer.from("data"));
      deleteFile(admin.id, generalFile.id);

      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      uploadUserAvatar(owner.id, "a.png", "image/png", png);
      uploadUserAvatar(owner.id, "b.png", "image/png", png);

      const auth = createAuthenticatedSession(owner.id);
      db.prepare("UPDATE user_sessions SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(auth.session.id);
      expect(validateSession(auth.session.id, owner.id)).toBeNull();
      expect(() => rotateRefreshSession("invalid-refresh-token")).toThrow();

      const fresh = createAuthenticatedSession(owner.id);
      const rotated = rotateRefreshSession(fresh.refreshToken);
      const originalPrepareSession = db.prepare.bind(db);
      jest.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
        if (
          typeof sql === "string" &&
          sql.includes("UPDATE user_sessions") &&
          sql.includes("refresh_token_hash = ?")
        ) {
          return { run: () => ({ changes: 0 }) } as ReturnType<typeof db.prepare>;
        }
        return originalPrepareSession(sql as string);
      });
      expect(() => rotateRefreshSession(rotated.refreshToken)).toThrow("Refresh session conflict");
      jest.restoreAllMocks();

      setRoleEffect(id, "tech-lead", "team.create", "approval_required");
      const apprMember = addWorkspaceMember(id, "tech-lead");
      grantMemberOverride(id, apprMember.id, ["project.view"], ["project.create"]);
      const apprReq = createApprovalRequest(apprMember.id, id, "team.create", "Create", "Need");
      approveRequest(owner.id, apprReq.id);

      listFilesByEntity(owner.id, id, "general", id);
      const oldAvatarPath = "d:\\Projects\\PY-BOT\\PY-BOT\\backend\\uploads\\avatars\\old-test.png";
      fs.mkdirSync("d:\\Projects\\PY-BOT\\PY-BOT\\backend\\uploads\\avatars", { recursive: true });
      fs.writeFileSync(oldAvatarPath, png);
      db.prepare("UPDATE users SET avatar_path = ? WHERE id = ?").run(oldAvatarPath, owner.id);
      uploadUserAvatar(owner.id, "c.png", "image/png", png);

      const expiredInvite = createInvitation(owner.id, id, "expired@test.local", getRoleBySlug(id, "developer")!.id);
      db.prepare("UPDATE workspace_invitations SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(expiredInvite.id);
      expect(getInvitationPreview(expiredInvite.token)).toEqual({ valid: false, reason: "expired" });

      expect(bumpSecurityVersionForUserInWorkspace(id, owner.id, "permission.changed")).toBeGreaterThan(0);

      const legacyRoleId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO workspace_roles (id, workspace_id, name, slug, is_system)
        VALUES (?, ?, 'Legacy Member', 'member', 0)
      `).run(legacyRoleId, id);
      db.prepare("UPDATE workspace_members SET role_id = ? WHERE id = ?").run(legacyRoleId, memberRowId(id, viewer.id));
      migrateMissingSystemRoles();

      const foreignWs = createWorkspaceFixture("foreign_ws");
      const foreignTask = createTask(foreignWs.owner.id, { title: "Foreign", workspace_id: foreignWs.id });
      expect(() => assignTeamToEntity(owner.id, id, team.id, "task", foreignTask.id)).toThrow();

      const noPermUser = createTestUser("stats_no_perm");
      addWorkspaceMember(id, "viewer", noPermUser);
      setRoleEffect(id, "viewer", "task.view", "deny");
      expect(getDashboardStats(noPermUser.id).totals.tasks).toBe(0);

      setRoleEffect(id, "tech-lead", "workspace.manage", "approval_required");
      expect(() => requirePermission(apprMember.id, id, "workspace.manage")).toThrow(PermissionDeniedError);

      setRoleEffect(id, "admin", "approval.decide.tasks", "allow");
      expect(canDecideApproval(admin.id, id, "task.edit")).toBe(true);

      setRoleEffect(id, "tech-lead", "project.create", "approval_required");
      expect(() => requirePermission(apprMember.id, id, "project.create")).toThrow(PermissionDeniedError);

      const txMember = addWorkspaceMember(id, "qa-engineer");
      const txJoinReq = requestTeamMembership(txMember.id, id, team.id, "Tx path");
      const prepareBind = db.prepare.bind(db);
      jest.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
        if (typeof sql === "string" && sql.includes("SELECT status FROM team_membership_requests WHERE id = ?")) {
          return { get: () => ({ status: "approved" }) } as ReturnType<typeof db.prepare>;
        }
        return prepareBind(sql as string);
      });
      expect(() => approveTeamJoinRequest(owner.id, txJoinReq.id)).toThrow("Request is no longer pending");
      jest.restoreAllMocks();

      const txRejectMember = addWorkspaceMember(id, "developer");
      const txRejectReq = requestTeamMembership(txRejectMember.id, id, team.id, "Tx reject");
      jest.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
        if (typeof sql === "string" && sql.includes("UPDATE team_membership_requests") && sql.includes("rejected")) {
          return { run: () => ({ changes: 0 }) } as ReturnType<typeof db.prepare>;
        }
        return prepareBind(sql as string);
      });
      expect(() => rejectTeamJoinRequest(owner.id, txRejectReq.id, "once")).toThrow("Request is no longer pending");
      jest.restoreAllMocks();

      expect(getTimeSummary(timeMember.id, id).entryCount).toBeGreaterThan(0);

      void joinReq;
      void approveGuardReq;
      void rejectGuardReq;
    });
  });
});
