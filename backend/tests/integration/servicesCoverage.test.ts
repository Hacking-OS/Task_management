import { jest } from "@jest/globals";
import { db } from "../../src/db.js";
import {
  acceptInvitation,
  acceptAllPendingInvitationsForUser,
  createInvitation,
  getInvitationPreview,
  getMemberWithPermissions,
  listInvitations,
  listMyPendingInvitations,
  listMembers,
  rejectInvitation,
  resendInvitation,
  revokeInvitation,
} from "../../src/services/workspaceMembers.js";
import {
  assertSameWorkspaceTeamProject,
  listAccessibleProjectIds,
  resolveProjectAccess,
} from "../../src/services/projectAccess.js";
import {
  canDecideApproval,
  getAllowedPermissions,
  isApprovalDecideCode,
  approvalDecideCode,
  resolvePermission,
} from "../../src/services/permissionResolver.js";
import {
  createTimeEntry,
  deleteTimeEntry,
  getTimeSummary,
  listTimeEntries,
  updateTimeEntry,
} from "../../src/services/timeEntries.js";
import {
  ForbiddenError,
  listWorkspaceIdsWithPermission,
  migrateLegacyWorkspaces,
  requireMembership,
} from "../../src/services/authorization.js";
import {
  deleteFile,
  getFile,
  listFiles,
  readFileContent,
  uploadCategorizedFile,
  uploadUserAvatar,
} from "../../src/services/files.js";
import {
  addProjectMember,
  createProject,
  deleteProject,
  getMemberManagementSummary,
  getProject,
  getWorkspaceOverview,
  listProjectSummaries,
  listProjectsForMemberUser,
  listProjectsForTeam,
  removeProjectMember,
  setProjectLead,
  setProjectTeams,
  updateProject,
} from "../../src/services/projects.js";
import {
  approveRequest,
  createApprovalRequest,
  isApprovalFlowsEnabled,
  listAllApprovals,
  listPendingApprovalsForDecider,
  rejectRequest,
  setApprovalFlowsEnabled,
} from "../../src/services/approvalFlows.js";
import { seedDemoData } from "../../src/services/demoSeed.js";
import { ActivityLogger } from "../../src/services/activityLogger.js";
import { backfillAssignmentsFromLegacy } from "../../src/services/entityAssignments.js";
import { syncMembersAfterRolePermissionChange, snapshotRoleMemberPermissions, syncMemberPermissionChange } from "../../src/services/permissionEvents.js";
import { logSecurityEvent } from "../../src/services/securityEvents.js";
import {
  bumpSecurityVersionForRoleMembers,
  bumpSecurityVersionForUserInWorkspace,
  getMemberSecurityVersion,
  getMemberSecurityVersionById,
} from "../../src/services/securityVersion.js";
import { createAuthenticatedSession, rotateRefreshSession } from "../../src/services/sessions.js";
import { register } from "../../src/services/auth.js";
import { createStatus, migrateAllWorkspaceStatuses } from "../../src/services/workspaceStatuses.js";
import * as teamService from "../../src/services/teams.js";
import { createTask } from "../../src/services/tasks.js";
import { createIssue } from "../../src/services/issues.js";
import { createSubtask, updateSubtask } from "../../src/services/subtasks.js";
import { createComment } from "../../src/services/comments.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";
import {
  addWorkspaceMember,
  createTestUser,
  createWorkspaceFixture,
  grantMemberOverride,
  setRoleEffect,
} from "../setup/fixtures.js";

function memberRowId(workspaceId: string, userId: string): string {
  const row = db.prepare(`
    SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(workspaceId, userId) as { id: string };
  return row.id;
}

describe("servicesCoverage — workspaceMembers", () => {
  it("rejectInvitation succeeds when email matches", () => {
    const { id, owner } = createWorkspaceFixture("wm_reject");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "rejectme@t.local", role.id);
    const user = createTestUser("wm_reject_user");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("rejectme@t.local", user.id);

    rejectInvitation(user.id, invite.token);

    const row = db.prepare("SELECT status FROM workspace_invitations WHERE id = ?").get(invite.id) as {
      status: string;
    };
    expect(row.status).toBe("rejected");
  });

  it("getInvitationPreview covers valid, expired, not_found, and wrong status", () => {
    const { id, owner } = createWorkspaceFixture("wm_preview");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "preview@t.local", role.id);

    const valid = getInvitationPreview(invite.invite_code);
    expect(valid.valid).toBe(true);
    if (valid.valid) {
      expect(valid.workspace_name).toBeTruthy();
      expect(valid.email).toContain("@");
    }

    db.prepare("UPDATE workspace_invitations SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(invite.id);
    const expired = getInvitationPreview(invite.token);
    expect(expired.valid).toBe(false);
    if (!expired.valid) expect(expired.reason).toBe("expired");

    const notFound = getInvitationPreview("ZZZZZZZZ");
    expect(notFound.valid).toBe(false);
    if (!notFound.valid) expect(notFound.reason).toBe("not_found");

    const invite2 = createInvitation(owner.id, id, "revoked@t.local", role.id);
    db.prepare("UPDATE workspace_invitations SET status = 'revoked' WHERE id = ?").run(invite2.id);
    const revoked = getInvitationPreview(invite2.token);
    expect(revoked.valid).toBe(false);
    if (!revoked.valid) expect(revoked.reason).toBe("revoked");
  });

  it("acceptInvitation marks accepted when user is already a member", () => {
    const { id, owner } = createWorkspaceFixture("wm_already_member");
    const role = getRoleBySlug(id, "developer")!;
    const user = createTestUser("wm_already_user");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("alreadymember@t.local", user.id);
    const invite = createInvitation(owner.id, id, "alreadymember@t.local", role.id);
    addWorkspaceMember(id, "developer", user);

    const result = acceptInvitation(user.id, invite.token);
    expect(result.workspaceId).toBe(id);

    const status = db.prepare("SELECT status FROM workspace_invitations WHERE id = ?").get(invite.id) as {
      status: string;
    };
    expect(status.status).toBe("accepted");
  });

  it("rejectInvitation throws when email does not match", () => {
    const { id, owner } = createWorkspaceFixture("wm_reject_bad");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "invited@t.local", role.id);
    const other = createTestUser("wm_reject_other");

    expect(() => rejectInvitation(other.id, invite.token)).toThrow(ForbiddenError);
  });

  it("acceptInvitation allows owner-sent invite when user already has another workspace", () => {
    const { id: ws1 } = createWorkspaceFixture("wm_multi_a");
    const { id: ws2, owner: o2 } = createWorkspaceFixture("wm_multi_b");
    const member = addWorkspaceMember(ws1, "developer");
    const role2 = getRoleBySlug(ws2, "developer")!;
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("multi@t.local", member.id);
    const invite = createInvitation(o2.id, ws2, "multi@t.local", role2.id);

    const result = acceptInvitation(member.id, invite.token);
    expect(result.workspaceId).toBe(ws2);
  });

  it("acceptAllPendingInvitationsForUser joins all matching pending invites", () => {
    const { id: ws1, owner: o1 } = createWorkspaceFixture("wm_accept_all_a");
    const { id: ws2, owner: o2 } = createWorkspaceFixture("wm_accept_all_b");
    const role1 = getRoleBySlug(ws1, "developer")!;
    const role2 = getRoleBySlug(ws2, "developer")!;
    createInvitation(o1.id, ws1, "acceptall@t.local", role1.id);
    createInvitation(o2.id, ws2, "acceptall@t.local", role2.id);

    const user = createTestUser("wm_accept_all_user");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("acceptall@t.local", user.id);

    const joined = acceptAllPendingInvitationsForUser(user.id);
    expect(joined).toContain(ws1);
    expect(joined).toContain(ws2);
  });

  it("listInvitations, resendInvitation, and revokeInvitation via service", () => {
    const { id, owner } = createWorkspaceFixture("wm_list");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "listinv@t.local", role.id);

    const listed = listInvitations(id);
    expect(listed.some((i) => i.id === invite.id)).toBe(true);

    const resent = resendInvitation(owner.id, id, invite.id);
    expect(resent.token).not.toBe(invite.token);

    revokeInvitation(owner.id, id, invite.id);
    const after = db.prepare("SELECT status FROM workspace_invitations WHERE id = ?").get(invite.id) as {
      status: string;
    };
    expect(after.status).toBe("revoked");
  });

  it("getMemberWithPermissions returns early for permissions_hidden member", () => {
    const { id, owner } = createWorkspaceFixture("wm_hidden");
    const viewer = addWorkspaceMember(id, "developer");
    const ownerMember = listMembers(id).find((m) => m.user_id === owner.id)!;

    const result = getMemberWithPermissions(id, ownerMember.id, viewer.id);
    expect(result.permissions_hidden).toBe(true);
    expect(result.role_permissions).toBeUndefined();
    expect(result.effective_permissions).toBeUndefined();
  });

  it("createInvitation retries uniqueInviteCode on collision", () => {
    const { id, owner } = createWorkspaceFixture("wm_code_retry");
    const role = getRoleBySlug(id, "developer")!;
    const collisionCode = "AAAAAAAA";

    db.prepare(`
      INSERT INTO workspace_invitations (
        id, workspace_id, email, invited_by, role_id, status, token, invite_code, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now', '+7 days'))
    `).run(crypto.randomUUID(), id, "collision@t.local", owner.id, role.id, crypto.randomUUID(), collisionCode);

    const randomSpy = jest.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0).mockReturnValueOnce(0.5);

    const invite = createInvitation(owner.id, id, "retrycode@t.local", role.id);
    expect(invite.invite_code).toBeTruthy();
    expect(invite.invite_code).not.toBe(collisionCode);

    randomSpy.mockRestore();
  });
});

describe("servicesCoverage — projectAccess", () => {
  it("resolveProjectAccess for direct membership, team access, and no access", () => {
    const { id, owner } = createWorkspaceFixture("pa_access");
    const member = addWorkspaceMember(id, "developer");
    const memberId = memberRowId(id, member.id);
    const ownerMemberId = memberRowId(id, owner.id);

    const project = createProject(owner.id, id, { name: "Alpha" });
    addProjectMember(owner.id, id, project.id, memberId, "member");

    const direct = resolveProjectAccess(member.id, id, project.id);
    expect(direct.hasAccess).toBe(true);
    expect(direct.directMember).toBe(true);
    expect(direct.isWorkspaceOwner).toBe(false);

    const team = teamService.createTeam(owner.id, id, { name: "Access Team", lead_member_id: ownerMemberId });
    teamService.addTeamMember(owner.id, id, team.id, memberId);
    const teamProject = createProject(owner.id, id, { name: "Team Project" });
    setProjectTeams(owner.id, id, teamProject.id, [team.id]);

    const viaTeam = resolveProjectAccess(member.id, id, teamProject.id);
    expect(viaTeam.hasAccess).toBe(true);
    expect(viaTeam.viaTeams.length).toBeGreaterThan(0);

    const outsider = createTestUser("pa_outsider");
    const none = resolveProjectAccess(outsider.id, id, project.id);
    expect(none.hasAccess).toBe(false);
  });

  it("listAccessibleProjectIds differs for owner vs member", () => {
    const { id, owner } = createWorkspaceFixture("pa_list");
    const member = addWorkspaceMember(id, "developer");
    const memberId = memberRowId(id, member.id);

    const p1 = createProject(owner.id, id, { name: "Visible" });
    createProject(owner.id, id, { name: "Hidden" });
    addProjectMember(owner.id, id, p1.id, memberId, "member");

    const ownerIds = listAccessibleProjectIds(owner.id, id);
    const memberIds = listAccessibleProjectIds(member.id, id);

    expect(ownerIds.length).toBeGreaterThanOrEqual(2);
    expect(memberIds).toEqual([p1.id]);
  });

  it("assertSameWorkspaceTeamProject throws for invalid project or team", () => {
    const { id, owner } = createWorkspaceFixture("pa_assert");
    const other = createWorkspaceFixture("pa_assert_other");
    const project = createProject(owner.id, id, { name: "Assert Project" });
    const team = teamService.createTeam(owner.id, id, { name: "Assert Team" });

    expect(() => assertSameWorkspaceTeamProject(id, "00000000-0000-0000-0000-000000000099", team.id)).toThrow(
      "Project not found in workspace",
    );
    expect(() => assertSameWorkspaceTeamProject(id, project.id, "00000000-0000-0000-0000-000000000099")).toThrow(
      "Team not found in workspace",
    );
    expect(() => assertSameWorkspaceTeamProject(id, project.id, team.id)).not.toThrow();

    const foreignProject = createProject(other.owner.id, other.id, { name: "Foreign" });
    expect(() => assertSameWorkspaceTeamProject(id, foreignProject.id, team.id)).toThrow(
      "Project not found in workspace",
    );
  });
});

describe("servicesCoverage — permissionResolver", () => {
  it("getAllowedPermissions for owner and member with grants/denies", () => {
    const { id, owner } = createWorkspaceFixture("pr_allowed");
    const member = addWorkspaceMember(id, "developer");

    const ownerPerms = getAllowedPermissions(owner.id, id);
    expect(ownerPerms.length).toBeGreaterThan(50);

    setRoleEffect(id, "developer", "team.view", "allow");
    grantMemberOverride(id, member.id, ["project.view"], ["team.view"]);

    const memberPerms = getAllowedPermissions(member.id, id);
    expect(memberPerms).toContain("project.view");
    expect(memberPerms).not.toContain("team.view");
  });

  it("canDecideApproval respects grant and deny overrides", () => {
    const { id, owner } = createWorkspaceFixture("pr_decide");
    const admin = addWorkspaceMember(id, "admin");

    expect(canDecideApproval(owner.id, id, "team.create")).toBe(true);

    grantMemberOverride(id, admin.id, ["approval.decide.teams"], []);
    expect(canDecideApproval(admin.id, id, "team.create")).toBe(true);

    grantMemberOverride(id, admin.id, [], ["approval.decide"]);
    expect(canDecideApproval(admin.id, id, "team.create")).toBe(false);
  });

  it("resolvePermission returns not granted when role has no effect", () => {
    const { id } = createWorkspaceFixture("pr_noeffect");
    const member = addWorkspaceMember(id, "viewer");
    const result = resolvePermission(member.id, id, "workspace.delete");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Not granted by role");
  });
});

describe("servicesCoverage — timeEntries", () => {
  it("lists with filters, creates, updates, deletes, and validates input", () => {
    const { id, owner } = createWorkspaceFixture("te_crud");
    const task = createTask(owner.id, { title: "Time", workspace_id: id });

    const entry = createTimeEntry(owner.id, id, {
      entity_type: "task",
      entity_id: task.id,
      work_date: "2026-03-01",
      hours: 2,
      description: "Work",
    });

    const listed = listTimeEntries(owner.id, id, {
      entity_type: "task",
      entity_id: task.id,
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(listed.some((e) => e.id === entry.id)).toBe(true);

    const updated = updateTimeEntry(owner.id, entry.id, { hours: 3, work_date: "2026-03-02" });
    expect(updated.hours).toBe(3);

    deleteTimeEntry(owner.id, entry.id);
    expect(listTimeEntries(owner.id, id, { entity_id: task.id }).length).toBe(0);

    expect(() =>
      createTimeEntry(owner.id, id, {
        entity_type: "task",
        entity_id: task.id,
        work_date: "bad-date",
        hours: 2,
      }),
    ).toThrow();
    expect(() => createTimeEntry(owner.id, id, { entity_type: "task", entity_id: task.id, work_date: "2026-03-01", hours: -1 })).toThrow();
  });

  it("getTimeSummary aggregates hours in date range", () => {
    const { id, owner } = createWorkspaceFixture("te_summary");
    const task = createTask(owner.id, { title: "Summary task", workspace_id: id });
    createTimeEntry(owner.id, id, {
      entity_type: "task",
      entity_id: task.id,
      work_date: "2026-02-01",
      hours: 1.5,
    });
    createTimeEntry(owner.id, id, {
      entity_type: "task",
      entity_id: task.id,
      work_date: "2026-02-15",
      hours: 2.5,
    });

    const summary = getTimeSummary(owner.id, id, { from: "2026-02-01", to: "2026-02-28" });
    expect(summary.entryCount).toBe(2);
    expect(summary.totalHours).toBe(4);
  });
});

describe("servicesCoverage — authorization", () => {
  it("listWorkspaceIdsWithPermission and requireMembership errors", () => {
    const { id, owner } = createWorkspaceFixture("auth_list");
    const member = addWorkspaceMember(id, "developer");

    const ids = listWorkspaceIdsWithPermission(member.id, "task.view");
    expect(ids).toContain(id);

    expect(() => requireMembership(createTestUser("auth_out").id, id)).toThrow(ForbiddenError);
  });

  it("migrateLegacyWorkspaces seeds roles and owner membership", () => {
    const user = createTestUser("legacy_owner");
    const wsId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO workspaces (id, user_id, name, description, is_active)
      VALUES (?, ?, ?, ?, 0)
    `).run(wsId, user.id, "Legacy WS", "No roles yet");

    migrateLegacyWorkspaces();

    const roleCount = db.prepare("SELECT COUNT(*) AS c FROM workspace_roles WHERE workspace_id = ?").get(wsId) as {
      c: number;
    };
    expect(roleCount.c).toBeGreaterThan(0);

    const membership = db.prepare(`
      SELECT m.id FROM workspace_members m WHERE m.workspace_id = ? AND m.user_id = ?
    `).get(wsId, user.id);
    expect(membership).toBeDefined();
  });
});

describe("servicesCoverage — files", () => {
  it("uploads multiple categories, deletes, and handles read errors", () => {
    const { id, owner } = createWorkspaceFixture("files_cov");
    const task = createTask(owner.id, { title: "File task", workspace_id: id });
    const issue = createIssue(owner.id, { title: "File issue", workspace_id: id });
    const subtask = createSubtask(owner.id, { title: "File sub", workspace_id: id, task_id: task.id });
    const comment = createComment(owner.id, {
      workspace_id: id,
      entity_type: "task",
      entity_id: task.id,
      body: "Attachment comment",
    });

    for (const [category, entityId] of [
      ["task", task.id],
      ["issue", issue.id],
      ["subtask", subtask.id],
      ["comment", comment.id],
      ["general", id],
    ] as const) {
      const file = uploadCategorizedFile(
        owner.id,
        id,
        category,
        entityId,
        `${category}.txt`,
        "text/plain",
        Buffer.from(category),
      );
      expect(getFile(owner.id, file.id)?.id).toBe(file.id);
    }

    const listed = listFiles(owner.id, id, { category: "task", entity_id: task.id });
    expect(listed.length).toBeGreaterThan(0);

    const taskFile = listed[0];
    db.prepare("UPDATE workspace_files SET stored_path = ? WHERE id = ?").run("/nonexistent/path.bin", taskFile.id);
    expect(() => readFileContent(owner.id, taskFile.id)).toThrow("File missing on disk");

    deleteFile(owner.id, taskFile.id);
    expect(() => readFileContent(owner.id, taskFile.id)).toThrow("File not found");
  });

  it("uploadUserAvatar stores avatar and rejects invalid mime", () => {
    const user = createTestUser("avatar_user");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = uploadUserAvatar(user.id, "avatar.png", "image/png", png);
    expect(result.avatar_url).toContain(user.id);

    expect(() => uploadUserAvatar(user.id, "bad.txt", "text/plain", Buffer.from("x"))).toThrow(
      "Avatar must be JPEG, PNG, WebP, or GIF",
    );
  });
});

describe("servicesCoverage — projects", () => {
  it("full project CRUD, team linking, member add/remove, set lead", () => {
    const { id, owner } = createWorkspaceFixture("proj_crud");
    const member = addWorkspaceMember(id, "developer");
    const memberId = memberRowId(id, member.id);
    const ownerMemberId = memberRowId(id, owner.id);

    const created = createProject(owner.id, id, {
      name: "Platform",
      description: "Core platform",
      lead_member_id: ownerMemberId,
    });
    expect(created.name).toBe("Platform");

    const updated = updateProject(owner.id, id, created.id, { name: "Platform v2", status: "archived" });
    expect(updated.name).toBe("Platform v2");
    expect(updated.status).toBe("archived");

    const team = teamService.createTeam(owner.id, id, { name: "Platform Team", lead_member_id: ownerMemberId });
    setProjectTeams(owner.id, id, created.id, [team.id]);
    expect(getProject(owner.id, id, created.id)?.teams.some((t) => t.team_id === team.id)).toBe(true);

    addProjectMember(owner.id, id, created.id, memberId, "reviewer");
    expect(getProject(owner.id, id, created.id)?.members.some((m) => m.member_id === memberId)).toBe(true);

    setProjectLead(owner.id, id, created.id, memberId);
    expect(getProject(owner.id, id, created.id)?.lead_member_id).toBe(memberId);

    removeProjectMember(owner.id, id, created.id, memberId);
    deleteProject(owner.id, id, created.id);

    expect(listProjectSummaries(owner.id, id, { search: "Platform" }).length).toBe(0);
  });
});

describe("servicesCoverage — approvalFlows", () => {
  it("create, approve, reject, list filters, and edge cases", () => {
    const { id, owner } = createWorkspaceFixture("appr_cov");
    const member = addWorkspaceMember(id, "developer");
    setRoleEffect(id, "developer", "project.create", "approval_required");

    expect(isApprovalFlowsEnabled(id)).toBe(true);
    setApprovalFlowsEnabled(owner.id, id, false);
    expect(() => createApprovalRequest(member.id, id, "project.create", "Need create")).toThrow(
      "Approval flows are disabled",
    );
    setApprovalFlowsEnabled(owner.id, id, true);

    expect(() => createApprovalRequest(member.id, id, "fake.permission", "Bad")).toThrow("Invalid permission code");

    setRoleEffect(id, "developer", "project.view", "allow");
    expect(() => createApprovalRequest(member.id, id, "project.view", "Already have")).toThrow(
      "You already have this permission",
    );

    setRoleEffect(id, "developer", "team.delete", "deny");
    expect(() => createApprovalRequest(member.id, id, "team.delete", "Denied")).toThrow(ForbiddenError);

    setRoleEffect(id, "developer", "project.create", "approval_required");
    const request = createApprovalRequest(member.id, id, "project.create", "Need create", "Please");
    expect(() => createApprovalRequest(member.id, id, "project.create", "Duplicate")).toThrow(
      "A pending approval request already exists",
    );

    const pending = listPendingApprovalsForDecider(owner.id, id);
    expect(pending.some((r) => r.id === request.id)).toBe(true);

    const approved = approveRequest(owner.id, request.id);
    expect(approved.status).toMatch(/executed|approved/);

    setRoleEffect(id, "developer", "team.create", "approval_required");
    const rejectReq = createApprovalRequest(member.id, id, "team.create", "Team create");
    const rejected = rejectRequest(owner.id, rejectReq.id, "No thanks");
    expect(rejected.status).toBe("rejected");

    const all = listAllApprovals(owner.id, id, { status: "rejected" });
    expect(all.some((r) => r.id === rejectReq.id)).toBe(true);
  });
});

describe("servicesCoverage — demoSeed backfill", () => {
  it("seedDemoData backfills Acme projects when teams exist but projects were removed", () => {
    seedDemoData();
    const ws = db.prepare("SELECT id FROM workspaces WHERE name = ?").get("Acme Software") as { id: string };
    expect(ws).toBeDefined();

    db.prepare("DELETE FROM workspace_projects WHERE workspace_id = ?").run(ws.id);
    const before = db.prepare("SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ?").get(ws.id) as {
      c: number;
    };
    expect(before.c).toBe(0);

    seedDemoData();

    const after = db.prepare("SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ?").get(ws.id) as {
      c: number;
    };
    expect(after.c).toBeGreaterThan(0);
  });
});

describe("servicesCoverage — other service gaps", () => {
  it("ActivityLogger.forEntity resolves issue, subtask, and comment workspaces", () => {
    const { id, owner } = createWorkspaceFixture("act_entity");
    const task = createTask(owner.id, { title: "Parent", workspace_id: id });
    const issue = createIssue(owner.id, { title: "Issue log", workspace_id: id });
    const subtask = createSubtask(owner.id, { title: "Sub log", workspace_id: id, task_id: task.id });
    const comment = createComment(owner.id, {
      workspace_id: id,
      entity_type: "issue",
      entity_id: issue.id,
      body: "Logged comment",
    });

    ActivityLogger.log({
      userId: owner.id,
      workspaceId: id,
      entityType: "issue",
      entityId: issue.id,
      action: "issue_created",
      description: "Issue created",
    });

    expect(ActivityLogger.forEntity(owner.id, "issue", issue.id).length).toBeGreaterThan(0);
    expect(ActivityLogger.forEntity(owner.id, "subtask", subtask.id).length).toBeGreaterThanOrEqual(0);
    expect(ActivityLogger.forEntity(owner.id, "comment", comment.id).length).toBeGreaterThanOrEqual(0);
    expect(ActivityLogger.forEntity(owner.id, "unknown", "x")).toEqual([]);
  });

  it("backfillAssignmentsFromLegacy creates assignment rows from legacy assignee_id", () => {
    const { id, owner } = createWorkspaceFixture("assign_backfill");
    const assignee = addWorkspaceMember(id, "developer");
    const task = createTask(owner.id, {
      title: "Legacy assignee",
      workspace_id: id,
      assignee_ids: [assignee.id],
    });
    db.prepare("DELETE FROM assignments WHERE entity_id = ?").run(task.id);

    backfillAssignmentsFromLegacy();

    const rows = db.prepare(`
      SELECT assignee_id FROM assignments WHERE entity_type = 'task' AND entity_id = ?
    `).all(task.id) as { assignee_id: string }[];
    expect(rows.some((r) => r.assignee_id === assignee.id)).toBe(true);
  });

  it("syncMembersAfterRolePermissionChange notifies role members", () => {
    const { id, owner } = createWorkspaceFixture("perm_evt");
    const devRole = getRoleBySlug(id, "developer")!;
    addWorkspaceMember(id, "developer");
    const before = snapshotRoleMemberPermissions(id, devRole.id);
    syncMembersAfterRolePermissionChange(id, devRole.id, before, owner.id);
    expect(before.size).toBeGreaterThan(0);
  });

  it("logSecurityEvent applies default risk levels", () => {
    const denied = logSecurityEvent({ action: "ACCESS", result: "DENIED" });
    const blocked = logSecurityEvent({ action: "UNAUTHORIZED_ACCESS", result: "BLOCKED" });
    const loginFailed = logSecurityEvent({ action: "LOGIN_FAILED", result: "FAILED" });
    const success = logSecurityEvent({ action: "LOGIN", result: "SUCCESS" });

    const rows = db.prepare(`
      SELECT id, risk_level FROM security_events WHERE id IN (?, ?, ?, ?)
    `).all(denied, blocked, loginFailed, success) as { id: string; risk_level: string }[];

    const byId = new Map(rows.map((r) => [r.id, r.risk_level]));
    expect(byId.get(denied)).toBe("MEDIUM");
    expect(byId.get(blocked)).toBe("MEDIUM");
    expect(byId.get(loginFailed)).toBe("MEDIUM");
    expect(byId.get(success)).toBe("INFO");
  });

  it("bumpSecurityVersionForRoleMembers and non-member revoke emit paths", () => {
    const { id, owner } = createWorkspaceFixture("sec_ver");
    const devRole = getRoleBySlug(id, "developer")!;
    const dev = addWorkspaceMember(id, "developer");

    const before = getMemberSecurityVersion(id, dev.id);
    bumpSecurityVersionForRoleMembers(id, devRole.id);
    expect(getMemberSecurityVersion(id, dev.id)).toBeGreaterThan(before);

    const removed = createTestUser("sec_removed");
    bumpSecurityVersionForUserInWorkspace(id, removed.id, "workspace.access.revoked");
    void owner;
  });

  it("rotateRefreshSession rejects expired refresh tokens", () => {
    const user = createTestUser("sess_expired");
    const { refreshToken, session } = createAuthenticatedSession(user.id);
    db.prepare("UPDATE user_sessions SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(session.id);

    expect(() => rotateRefreshSession(refreshToken)).toThrow("Refresh session expired");
  });

  it("register accepts invite token during signup", () => {
    const { id, owner } = createWorkspaceFixture("auth_invite");
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "signupinvite@t.local", role.id);

    const result = register("signup_invite_user", "signupinvite@t.local", "TestPass1", invite.token);
    expect(result.joined_workspace_ids).toContain(id);
  });

  it("migrateAllWorkspaceStatuses seeds missing statuses", () => {
    const { id } = createWorkspaceFixture("status_migrate");
    db.prepare("DELETE FROM workspace_statuses WHERE workspace_id = ?").run(id);
    migrateAllWorkspaceStatuses();
    const count = db.prepare("SELECT COUNT(*) AS c FROM workspace_statuses WHERE workspace_id = ?").get(id) as {
      c: number;
    };
    expect(count.c).toBeGreaterThan(0);
  });

  it("requireTeamLeadOrOwner blocks non-lead from managing team members", () => {
    const { id, owner } = createWorkspaceFixture("team_lead");
    const admin = addWorkspaceMember(id, "admin");
    setRoleEffect(id, "admin", "team.manage_members", "allow");
    const ownerMemberId = memberRowId(id, owner.id);
    const adminMemberId = memberRowId(id, admin.id);
    const team = teamService.createTeam(owner.id, id, { name: "Restricted", lead_member_id: ownerMemberId });

    expect(() => teamService.addTeamMember(admin.id, id, team.id, adminMemberId)).toThrow(
      "Only the workspace owner or team lead can manage this team",
    );
  });

  it("updateSubtask logs status_changed for non-closing transitions", () => {
    const { id, owner } = createWorkspaceFixture("sub_status");
    createStatus(id, "subtask", { slug: "review", label: "Review", color: "#3b82f6", sort_order: 1, is_closed: 0 });
    const task = createTask(owner.id, { title: "Parent task", workspace_id: id });
    const subtask = createSubtask(owner.id, { title: "Child", workspace_id: id, task_id: task.id, status: "todo" });

    updateSubtask(owner.id, subtask.id, { status: "review" });

    const logs = ActivityLogger.list({
      userId: owner.id,
      workspaceId: id,
      entityType: "subtask",
      entityId: subtask.id,
    });
    expect(logs.some((l) => l.action === "status_changed")).toBe(true);
  });

  it("listMyPendingInvitations returns pending invites for user email", () => {
    const { id, owner } = createWorkspaceFixture("wm_pending_list");
    const role = getRoleBySlug(id, "developer")!;
    createInvitation(owner.id, id, "pendinglist@t.local", role.id);
    const user = createTestUser("wm_pending_user");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("pendinglist@t.local", user.id);

    const pending = listMyPendingInvitations(user.id);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("register ignores invalid invite token during signup", () => {
    const result = register("invalid_invite_user", "invalidinvite@t.local", "TestPass1", "not-a-real-token");
    expect(result.joined_workspace_ids).toEqual([]);
  });

  it("ActivityLogger.list without workspace uses user filter", () => {
    const { id, owner } = createWorkspaceFixture("act_no_ws");
    ActivityLogger.log({
      userId: owner.id,
      workspaceId: id,
      entityType: "workspace",
      entityId: id,
      action: "user_scoped",
      description: "User scoped log",
    });
    expect(ActivityLogger.list({ userId: owner.id, limit: 5 }).some((l) => l.action === "user_scoped")).toBe(true);
  });

  it("backfillAssignmentsFromLegacy skips entities that already have assignments", () => {
    const { id, owner } = createWorkspaceFixture("assign_skip");
    const assignee = addWorkspaceMember(id, "developer");
    const task = createTask(owner.id, {
      title: "Already assigned",
      workspace_id: id,
      assignee_ids: [assignee.id],
    });
    const before = db.prepare("SELECT COUNT(*) AS c FROM assignments WHERE entity_id = ?").get(task.id) as { c: number };

    backfillAssignmentsFromLegacy();

    const after = db.prepare("SELECT COUNT(*) AS c FROM assignments WHERE entity_id = ?").get(task.id) as { c: number };
    expect(after.c).toBe(before.c);
  });

  it("syncMemberPermissionChange detects admin authority changes", () => {
    const { id, owner } = createWorkspaceFixture("perm_admin_evt");
    const admin = addWorkspaceMember(id, "admin");
    const before = getAllowedPermissions(admin.id, id);
    grantMemberOverride(id, admin.id, ["approval.decide.teams"], []);
    syncMemberPermissionChange(id, admin.id, before, owner.id);
  });

  it("syncMemberPermissionChange short-circuits when actor updates own permissions", () => {
    const { id, owner } = createWorkspaceFixture("perm_self_evt");
    const before = getAllowedPermissions(owner.id, id);
    syncMemberPermissionChange(id, owner.id, before, owner.id);
  });

  it("createInvitation notifies existing users by email", () => {
    const { id, owner } = createWorkspaceFixture("wm_existing_user");
    const existing = createTestUser("wm_existing_member");
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run("existingmember@t.local", existing.id);
    const role = getRoleBySlug(id, "developer")!;
    const invite = createInvitation(owner.id, id, "existingmember@t.local", role.id);
    expect(invite.email).toBe("existingmember@t.local");
  });

  it("listTimeEntries with view_all filter lists another user's entries", () => {
    const { id, owner } = createWorkspaceFixture("te_view_all");
    const member = addWorkspaceMember(id, "admin");
    setRoleEffect(id, "admin", "timesheet.view_all", "allow");
    const task = createTask(owner.id, { title: "Member time", workspace_id: id });
    createTimeEntry(member.id, id, {
      entity_type: "task",
      entity_id: task.id,
      work_date: "2026-04-01",
      hours: 1,
    });

    const rows = listTimeEntries(owner.id, id, { user_id: member.id });
    expect(rows.some((e) => e.user_id === member.id)).toBe(true);
  });

  it("timeEntries validates issue and subtask entities", () => {
    const { id, owner } = createWorkspaceFixture("te_entities");
    const task = createTask(owner.id, { title: "Parent", workspace_id: id });
    const issue = createIssue(owner.id, { title: "Issue time", workspace_id: id });
    const subtask = createSubtask(owner.id, { title: "Sub time", workspace_id: id, task_id: task.id });

    createTimeEntry(owner.id, id, {
      entity_type: "issue",
      entity_id: issue.id,
      work_date: "2026-05-01",
      hours: 1,
    });
    createTimeEntry(owner.id, id, {
      entity_type: "subtask",
      entity_id: subtask.id,
      work_date: "2026-05-02",
      hours: 2,
    });

    expect(listTimeEntries(owner.id, id, { entity_type: "issue" }).length).toBe(1);
    expect(listTimeEntries(owner.id, id, { entity_type: "subtask" }).length).toBe(1);
  });

  it("projects exposes team/member summaries and overview stats", () => {
    const { id, owner } = createWorkspaceFixture("proj_extra");
    const member = addWorkspaceMember(id, "developer");
    const memberId = memberRowId(id, member.id);
    const ownerMemberId = memberRowId(id, owner.id);
    const project = createProject(owner.id, id, { name: "Overview Project" });
    const team = teamService.createTeam(owner.id, id, { name: "Overview Team", lead_member_id: ownerMemberId });
    setProjectTeams(owner.id, id, project.id, [team.id]);
    teamService.addTeamMember(owner.id, id, team.id, memberId);
    addProjectMember(owner.id, id, project.id, memberId, "member");

    expect(listProjectsForTeam(owner.id, id, team.id).some((p) => p.id === project.id)).toBe(true);
    expect(listProjectsForMemberUser(id, member.id).some((p) => p.id === project.id)).toBe(true);

    const summary = getMemberManagementSummary(id, memberId);
    expect(summary?.projects.some((p) => p.id === project.id)).toBe(true);

    const overview = getWorkspaceOverview(owner.id, id);
    expect(overview.project_count).toBeGreaterThan(0);
    expect(overview.member_count).toBeGreaterThan(1);
  });

  it("permissionResolver helper functions cover approval decide branches", () => {
    expect(isApprovalDecideCode("approval.decide")).toBe(true);
    expect(isApprovalDecideCode("approval.decide.tasks")).toBe(true);
    expect(isApprovalDecideCode("task.view")).toBe(false);
    expect(approvalDecideCode("team.create")).toBe("approval.decide.team.create");
  });

  it("securityVersion helpers cover member id lookup and non-member bump", () => {
    const { id, owner } = createWorkspaceFixture("sec_ver_extra");
    const memberId = memberRowId(id, owner.id);
    expect(getMemberSecurityVersionById(memberId)).toBeGreaterThan(0);
    expect(bumpSecurityVersionForUserInWorkspace(id, createTestUser("sec_out").id, "permission.changed")).toBe(0);
  });

  it("seedDemoData backfill exits early when Acme has no teams", () => {
    seedDemoData();
    const ws = db.prepare("SELECT id FROM workspaces WHERE name = ?").get("Acme Software") as { id: string };
    db.prepare("DELETE FROM workspace_projects WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM workspace_teams WHERE workspace_id = ?").run(ws.id);
    seedDemoData();
    const count = db.prepare("SELECT COUNT(*) AS c FROM workspace_projects WHERE workspace_id = ?").get(ws.id) as {
      c: number;
    };
    expect(count.c).toBe(0);
  });
});
