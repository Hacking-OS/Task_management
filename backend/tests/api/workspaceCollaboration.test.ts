import { createApiAgent, authHeader } from "../helpers/apiAgent.js";
import {
  addWorkspaceMember,
  createTestUser,
  createWorkspaceFixture,
  setRoleEffect,
} from "../setup/fixtures.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";

function wsPath(workspaceId: string, suffix: string): string {
  return `/api/workspaces/${workspaceId}${suffix}`;
}

describe("workspace collaboration API", () => {
  const agent = createApiAgent();

  describe("permissions", () => {
    it("GET /permissions/catalog returns permission definitions", async () => {
      const { id, owner } = createWorkspaceFixture("collab_perm_cat");
      const res = await agent
        .get(wsPath(id, "/permissions/catalog"))
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(Array.isArray(res.body.permissions)).toBe(true);
      expect(res.body.permissions.length).toBeGreaterThan(0);
    });

    it("GET /permissions returns role matrix for members with member.view", async () => {
      const { id, owner } = createWorkspaceFixture("collab_perm_matrix");
      const res = await agent
        .get(wsPath(id, "/permissions"))
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(Array.isArray(res.body.roles)).toBe(true);
      expect(Array.isArray(res.body.permissions)).toBe(true);
    });

    it("GET /permissions/me returns current member context", async () => {
      const { id, owner } = createWorkspaceFixture("collab_perm_me");
      const res = await agent
        .get(wsPath(id, "/permissions/me"))
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(res.body.workspace_id).toBe(id);
      expect(res.body.is_owner).toBe(true);
      expect(Array.isArray(res.body.permissions)).toBe(true);
      expect(res.body.role_slug).toBeDefined();
    });
  });

  describe("statuses", () => {
    it("supports full status CRUD lifecycle", async () => {
      const { id, owner } = createWorkspaceFixture("collab_status");

      const listRes = await agent
        .get(wsPath(id, "/statuses"))
        .query({ entity_type: "task" })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(Array.isArray(listRes.body.statuses)).toBe(true);

      const createRes = await agent
        .post(wsPath(id, "/statuses"))
        .set(authHeader(owner.accessToken))
        .send({
          entity_type: "task",
          slug: "in_review",
          label: "In Review",
          color: "#ff9900",
          sort_order: 50,
        })
        .expect(201);
      const statusId = createRes.body.status.id as string;
      expect(createRes.body.status.label).toBe("In Review");

      const patchRes = await agent
        .patch(wsPath(id, `/statuses/${statusId}`))
        .set(authHeader(owner.accessToken))
        .send({ label: "Under Review", color: "#00aa00" })
        .expect(200);
      expect(patchRes.body.status.label).toBe("Under Review");

      await agent
        .delete(wsPath(id, `/statuses/${statusId}`))
        .set(authHeader(owner.accessToken))
        .expect(204);
    });

    it("rejects status create without required fields", async () => {
      const { id, owner } = createWorkspaceFixture("collab_status_bad");
      await agent
        .post(wsPath(id, "/statuses"))
        .set(authHeader(owner.accessToken))
        .send({ entity_type: "task" })
        .expect(400);
    });
  });

  describe("members", () => {
    it("lists members and supports role change and removal", async () => {
      const { id, owner } = createWorkspaceFixture("collab_members");
      const member = addWorkspaceMember(id, "developer");
      const viewerRole = getRoleBySlug(id, "viewer")!;

      const listRes = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.members.length).toBeGreaterThanOrEqual(2);

      const memberRow = listRes.body.members.find((m: { user_id: string }) => m.user_id === member.id);
      expect(memberRow).toBeDefined();

      const detailRes = await agent
        .get(wsPath(id, `/members/${memberRow.id}`))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(detailRes.body.member.username).toBe(member.username);

      const roleRes = await agent
        .patch(wsPath(id, `/members/${memberRow.id}/role`))
        .set(authHeader(owner.accessToken))
        .send({ role_id: viewerRole.id })
        .expect(200);
      expect(roleRes.body.member.role_slug).toBe("viewer");

      await agent
        .delete(wsPath(id, `/members/${memberRow.id}`))
        .set(authHeader(owner.accessToken))
        .expect(204);

      const afterList = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(afterList.body.members.some((m: { user_id: string }) => m.user_id === member.id)).toBe(false);
    });

    it("returns member management summary", async () => {
      const { id, owner } = createWorkspaceFixture("collab_member_summary");
      const member = addWorkspaceMember(id, "developer");
      const listRes = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const memberRow = listRes.body.members.find((m: { user_id: string }) => m.user_id === member.id);

      const summaryRes = await agent
        .get(wsPath(id, `/members/${memberRow.id}/summary`))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(summaryRes.body.summary).toBeDefined();
    });
  });

  describe("teams and join requests", () => {
    it("supports team CRUD, members, and join request flow", async () => {
      const { id, owner } = createWorkspaceFixture("collab_teams");
      const joiner = addWorkspaceMember(id, "viewer");

      const createRes = await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Platform Team", description: "Core infra" })
        .expect(201);
      const teamId = createRes.body.team.id as string;

      const listRes = await agent
        .get(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.teams.some((t: { id: string }) => t.id === teamId)).toBe(true);

      const getRes = await agent
        .get(wsPath(id, `/teams/${teamId}`))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(getRes.body.team.name).toBe("Platform Team");

      const patchRes = await agent
        .patch(wsPath(id, `/teams/${teamId}`))
        .set(authHeader(owner.accessToken))
        .send({ description: "Updated description" })
        .expect(200);
      expect(patchRes.body.team.description).toBe("Updated description");

      const ownerMembers = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const ownerMemberRow = ownerMembers.body.members.find(
        (m: { user_id: string }) => m.user_id === owner.id,
      );

      await agent
        .put(wsPath(id, `/teams/${teamId}/lead`))
        .set(authHeader(owner.accessToken))
        .send({ member_id: ownerMemberRow.id })
        .expect(200);

      const joinRes = await agent
        .post(wsPath(id, `/teams/${teamId}/join-requests`))
        .set(authHeader(joiner.accessToken))
        .send({ reason: "Want to contribute" })
        .expect(201);
      const requestId = joinRes.body.request.id as string;

      const pendingRes = await agent
        .get(wsPath(id, `/teams/${teamId}/join-requests`))
        .query({ status: "pending" })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(pendingRes.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      const myStatusRes = await agent
        .get(wsPath(id, `/teams/${teamId}/my-join-status`))
        .set(authHeader(joiner.accessToken))
        .expect(200);
      expect(myStatusRes.body.pending).toBe(true);

      const mineRes = await agent
        .get(wsPath(id, "/team-join-requests/mine"))
        .set(authHeader(joiner.accessToken))
        .expect(200);
      expect(mineRes.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      await agent
        .post(wsPath(id, `/team-join-requests/${requestId}/approve`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      const joinerMembers = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const joinerMemberRow = joinerMembers.body.members.find(
        (m: { user_id: string }) => m.user_id === joiner.id,
      );

      const addMemberRes = await agent
        .post(wsPath(id, `/teams/${teamId}/members`))
        .set(authHeader(owner.accessToken))
        .send({ member_id: joinerMemberRow.id })
        .expect(200);
      expect(addMemberRes.body.team).toBeDefined();

      await agent
        .delete(wsPath(id, `/teams/${teamId}/members/${joinerMemberRow.id}`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      await agent
        .delete(wsPath(id, `/teams/${teamId}`))
        .set(authHeader(owner.accessToken))
        .expect(204);
    });

    it("team lead can reject a join request", async () => {
      const { id, owner } = createWorkspaceFixture("collab_join_reject");
      const joiner = addWorkspaceMember(id, "viewer");

      const createTeamRes = await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Reject Team" })
        .expect(201);
      const teamId = createTeamRes.body.team.id as string;

      const joinRes = await agent
        .post(wsPath(id, `/teams/${teamId}/join-requests`))
        .set(authHeader(joiner.accessToken))
        .send({ reason: "Want in" })
        .expect(201);
      const requestId = joinRes.body.request.id as string;

      const rejectRes = await agent
        .post(wsPath(id, `/team-join-requests/${requestId}/reject`))
        .set(authHeader(owner.accessToken))
        .send({ reason: "Not a fit" })
        .expect(200);

      expect(rejectRes.body.request.status).toBe("rejected");
    });
  });

  describe("projects", () => {
    it("supports project CRUD and member management", async () => {
      const { id, owner } = createWorkspaceFixture("collab_projects");
      const member = addWorkspaceMember(id, "developer");

      const createRes = await agent
        .post(wsPath(id, "/projects"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Alpha Project", description: "First project" })
        .expect(201);
      const projectId = createRes.body.project.id as string;

      const listRes = await agent
        .get(wsPath(id, "/projects"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.projects.some((p: { id: string }) => p.id === projectId)).toBe(true);

      const getRes = await agent
        .get(wsPath(id, `/projects/${projectId}`))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(getRes.body.project.name).toBe("Alpha Project");

      const patchRes = await agent
        .patch(wsPath(id, `/projects/${projectId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Alpha Renamed" })
        .expect(200);
      expect(patchRes.body.project.name).toBe("Alpha Renamed");

      const membersRes = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const memberRow = membersRes.body.members.find((m: { user_id: string }) => m.user_id === member.id);

      const addRes = await agent
        .post(wsPath(id, `/projects/${projectId}/members`))
        .set(authHeader(owner.accessToken))
        .send({ member_id: memberRow.id, role_in_project: "member" })
        .expect(200);
      expect(addRes.body.project).toBeDefined();

      await agent
        .put(wsPath(id, `/projects/${projectId}/lead`))
        .set(authHeader(owner.accessToken))
        .send({ member_id: memberRow.id })
        .expect(200);

      await agent
        .delete(wsPath(id, `/projects/${projectId}/members/${memberRow.id}`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      await agent
        .delete(wsPath(id, `/projects/${projectId}`))
        .set(authHeader(owner.accessToken))
        .expect(204);
    });

    it("supports project team linking and team-scoped project list", async () => {
      const { id, owner } = createWorkspaceFixture("collab_proj_teams");

      const teamRes = await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Project Team" })
        .expect(201);
      const teamId = teamRes.body.team.id as string;

      const createRes = await agent
        .post(wsPath(id, "/projects"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Team Linked Project" })
        .expect(201);
      const projectId = createRes.body.project.id as string;

      await agent
        .put(wsPath(id, `/projects/${projectId}/teams`))
        .set(authHeader(owner.accessToken))
        .send({ team_ids: [teamId] })
        .expect(200);

      const teamProjects = await agent
        .get(wsPath(id, `/teams/${teamId}/projects`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      expect(teamProjects.body.projects.some((p: { id: string }) => p.id === projectId)).toBe(true);
    });
  });

  describe("invitations", () => {
    it("owner can list and create workspace invitations", async () => {
      const { id, owner } = createWorkspaceFixture("collab_invite");
      const devRole = getRoleBySlug(id, "developer")!;

      const createRes = await agent
        .post(wsPath(id, "/invitations"))
        .set(authHeader(owner.accessToken))
        .send({ email: "invited@test.local", role_id: devRole.id })
        .expect(201);
      expect(createRes.body.invitation.status).toBe("pending");

      const listRes = await agent
        .get(wsPath(id, "/invitations"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.invitations.some((i: { email: string }) => i.email === "invited@test.local")).toBe(
        true,
      );

      const invitationId = createRes.body.invitation.id as string;
      await agent
        .post(wsPath(id, `/invitations/${invitationId}/resend`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      await agent
        .post(wsPath(id, `/invitations/${invitationId}/revoke`))
        .set(authHeader(owner.accessToken))
        .expect(204);
    });

    it("non-owner cannot list invitations", async () => {
      const { id } = createWorkspaceFixture("collab_invite_deny");
      const member = addWorkspaceMember(id, "developer");
      await agent.get(wsPath(id, "/invitations")).set(authHeader(member.accessToken)).expect(403);
    });
  });

  describe("approvals", () => {
    it("supports approval request create, list, and decide flows", async () => {
      const { id, owner } = createWorkspaceFixture("collab_approval");
      const member = addWorkspaceMember(id, "developer");
      setRoleEffect(id, "developer", "team.create", "approval_required");

      const createRes = await agent
        .post(wsPath(id, "/approvals"))
        .set(authHeader(member.accessToken))
        .send({
          permission_code: "team.create",
          title: "Need team create",
          description: "For new squad",
        })
        .expect(201);
      const requestId = createRes.body.request.id as string;

      const mineRes = await agent
        .get(wsPath(id, "/approvals/mine"))
        .set(authHeader(member.accessToken))
        .expect(200);
      expect(mineRes.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      const allRes = await agent
        .get(wsPath(id, "/approvals"))
        .query({ status: "pending" })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(allRes.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

      const pendingRes = await agent
        .get(wsPath(id, "/approvals/pending"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(Array.isArray(pendingRes.body.requests)).toBe(true);

      await agent
        .post(wsPath(id, `/approvals/${requestId}/approve`))
        .set(authHeader(owner.accessToken))
        .expect(200);
    });

    it("owner can reject an approval request", async () => {
      const { id, owner } = createWorkspaceFixture("collab_reject");
      const member = addWorkspaceMember(id, "developer");
      setRoleEffect(id, "developer", "team.create", "approval_required");

      const createRes = await agent
        .post(wsPath(id, "/approvals"))
        .set(authHeader(member.accessToken))
        .send({
          permission_code: "team.create",
          title: "Need team create",
          description: "For new squad",
        })
        .expect(201);
      const requestId = createRes.body.request.id as string;

      const rejectRes = await agent
        .post(wsPath(id, `/approvals/${requestId}/reject`))
        .set(authHeader(owner.accessToken))
        .send({ note: "Not now" })
        .expect(200);

      expect(rejectRes.body.request.status).toBe("rejected");
    });
  });

  describe("workspace-scoped tasks, issues, subtasks", () => {
    it("GET/POST /tasks under workspace scope", async () => {
      const { id, owner } = createWorkspaceFixture("collab_tasks");

      const createRes = await agent
        .post(wsPath(id, "/tasks"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Workspace Task", description: "Scoped", priority: "high" })
        .expect(201);
      const taskId = createRes.body.task.id as string;

      const listRes = await agent
        .get(wsPath(id, "/tasks"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.tasks.some((t: { id: string }) => t.id === taskId)).toBe(true);
    });

    it("GET/POST /issues under workspace scope", async () => {
      const { id, owner } = createWorkspaceFixture("collab_issues");

      const createRes = await agent
        .post(wsPath(id, "/issues"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Workspace Issue", description: "Bug report" })
        .expect(201);
      const issueId = createRes.body.issue.id as string;

      const listRes = await agent
        .get(wsPath(id, "/issues"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.issues.some((i: { id: string }) => i.id === issueId)).toBe(true);
    });

    it("GET/POST /subtasks under workspace scope", async () => {
      const { id, owner } = createWorkspaceFixture("collab_subtasks");

      const taskRes = await agent
        .post(wsPath(id, "/tasks"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Parent for subtask" })
        .expect(201);
      const taskId = taskRes.body.task.id as string;

      const createRes = await agent
        .post(wsPath(id, "/subtasks"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Workspace Subtask", task_id: taskId })
        .expect(201);
      const subtaskId = createRes.body.subtask.id as string;

      const listRes = await agent
        .get(wsPath(id, "/subtasks"))
        .query({ task_id: taskId })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(listRes.body.subtasks.some((s: { id: string }) => s.id === subtaskId)).toBe(true);
    });
  });

  describe("overview and team-assignments", () => {
    it("GET /overview returns workspace dashboard aggregates", async () => {
      const { id, owner } = createWorkspaceFixture("collab_overview");
      const res = await agent
        .get(wsPath(id, "/overview"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(res.body.overview).toBeDefined();
    });

    it("GET/POST/DELETE /team-assignments for tasks", async () => {
      const { id, owner } = createWorkspaceFixture("collab_assign");

      const teamRes = await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Assign Team" })
        .expect(201);
      const teamId = teamRes.body.team.id as string;

      const taskRes = await agent
        .post(wsPath(id, "/tasks"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Assigned Task" })
        .expect(201);
      const taskId = taskRes.body.task.id as string;

      const assignRes = await agent
        .post(wsPath(id, "/team-assignments"))
        .set(authHeader(owner.accessToken))
        .send({ team_id: teamId, entity_type: "task", entity_id: taskId })
        .expect(201);
      expect(assignRes.body.assignment).toBeDefined();

      const byEntityRes = await agent
        .get(wsPath(id, "/team-assignments"))
        .query({ entity_type: "task", entity_id: taskId })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(byEntityRes.body.assignments.length).toBeGreaterThan(0);

      const byTeamRes = await agent
        .get(wsPath(id, "/team-assignments"))
        .query({ team_id: teamId })
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(byTeamRes.body.assignments.length).toBeGreaterThan(0);

      await agent
        .delete(wsPath(id, "/team-assignments"))
        .set(authHeader(owner.accessToken))
        .send({ team_id: teamId, entity_type: "task", entity_id: taskId })
        .expect(204);
    });

    it("GET /team-assignments requires query params", async () => {
      const { id, owner } = createWorkspaceFixture("collab_assign_bad");
      await agent
        .get(wsPath(id, "/team-assignments"))
        .set(authHeader(owner.accessToken))
        .expect(400);
    });
  });

  describe("roles (owner-only)", () => {
    it("owner can create, update, clone, and delete custom roles", async () => {
      const { id, owner } = createWorkspaceFixture("collab_roles");

      const createRes = await agent
        .post(wsPath(id, "/roles"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Custom Analyst", permissions: ["task.view", "issue.view"] })
        .expect(201);
      const roleId = createRes.body.role.id as string;

      await agent
        .patch(wsPath(id, `/roles/${roleId}`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Renamed Analyst" })
        .expect(200);

      await agent
        .put(wsPath(id, `/roles/${roleId}/permissions`))
        .set(authHeader(owner.accessToken))
        .send({ permissions: ["task.view", "issue.view", "task.create"] })
        .expect(200);

      await agent
        .put(wsPath(id, `/roles/${roleId}/permissions`))
        .set(authHeader(owner.accessToken))
        .send({
          permission_effects: [
            { permission_code: "task.view", effect: "allow" },
            { permission_code: "issue.view", effect: "allow" },
            { permission_code: "task.create", effect: "approval_required" },
          ],
        })
        .expect(200);

      const devRole = getRoleBySlug(id, "developer")!;
      await agent
        .post(wsPath(id, `/roles/${devRole.id}/reset`))
        .set(authHeader(owner.accessToken))
        .expect(200);

      const cloneRes = await agent
        .post(wsPath(id, `/roles/${roleId}/clone`))
        .set(authHeader(owner.accessToken))
        .send({ name: "Analyst Copy" })
        .expect(201);
      const cloneId = cloneRes.body.role.id as string;

      await agent
        .delete(wsPath(id, `/roles/${cloneId}`))
        .set(authHeader(owner.accessToken))
        .expect(204);

      await agent
        .delete(wsPath(id, `/roles/${roleId}`))
        .set(authHeader(owner.accessToken))
        .expect(204);
    });
  });

  describe("user-scoped invitations", () => {
    it("GET /api/invitations/mine lists pending invitations for user", async () => {
      const user = createTestUser("inv_mine");
      await agent.get("/api/invitations/mine").set(authHeader(user.accessToken)).expect(200);
    });

    it("preview, accept, and reject invitations via API", async () => {
      const { id, owner } = createWorkspaceFixture("inv_api");
      const role = getRoleBySlug(id, "developer")!;

      const acceptInviteRes = await agent
        .post(wsPath(id, "/invitations"))
        .set(authHeader(owner.accessToken))
        .send({ email: "invaccept@test.local", role_id: role.id })
        .expect(201);
      const acceptToken = acceptInviteRes.body.invitation.token as string;

      const previewRes = await agent.get(`/api/invitations/preview/${acceptToken}`).expect(200);
      expect(previewRes.body.preview.valid).toBe(true);
      expect(previewRes.body.preview.workspace_name).toBeDefined();

      const acceptUser = createTestUser("inv_accept_api");
      const { db } = await import("../../src/db.js");
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run("invaccept@test.local", acceptUser.id);

      const acceptRes = await agent
        .post("/api/invitations/accept")
        .set(authHeader(acceptUser.accessToken))
        .send({ token: acceptToken })
        .expect(200);
      expect(acceptRes.body.workspaceId).toBe(id);

      const rejectInviteRes = await agent
        .post(wsPath(id, "/invitations"))
        .set(authHeader(owner.accessToken))
        .send({ email: "invreject@test.local", role_id: role.id })
        .expect(201);
      const rejectToken = rejectInviteRes.body.invitation.token as string;

      const rejectUser = createTestUser("inv_reject_api");
      db.prepare("UPDATE users SET email = ? WHERE id = ?").run("invreject@test.local", rejectUser.id);

      await agent
        .post("/api/invitations/reject")
        .set(authHeader(rejectUser.accessToken))
        .send({ code: rejectInviteRes.body.invitation.invite_code })
        .expect(204);
    });
  });

  describe("member permission overrides", () => {
    it("owner can customize and reset member permissions", async () => {
      const { id, owner } = createWorkspaceFixture("collab_mem_perm");
      const member = addWorkspaceMember(id, "developer");

      const membersRes = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const memberRow = membersRes.body.members.find((m: { user_id: string }) => m.user_id === member.id);

      const overrideRes = await agent
        .put(wsPath(id, `/members/${memberRow.id}/permissions`))
        .set(authHeader(owner.accessToken))
        .send({
          overrides: [{ permission_code: "task.delete", effect: "grant" }],
        })
        .expect(200);
      expect(overrideRes.body.member).toBeDefined();

      const resetRes = await agent
        .post(wsPath(id, `/members/${memberRow.id}/permissions/reset`))
        .set(authHeader(owner.accessToken))
        .expect(200);
      expect(resetRes.body.member).toBeDefined();
    });
  });

  describe("validation error paths (400)", () => {
    it("rejects malformed collaboration payloads", async () => {
      const { id, owner } = createWorkspaceFixture("collab_400");

      await agent.post(wsPath(id, "/roles")).set(authHeader(owner.accessToken)).send({}).expect(400);
      await agent
        .post(wsPath(id, "/roles/00000000-0000-0000-0000-000000000099/clone"))
        .set(authHeader(owner.accessToken))
        .send({})
        .expect(400);
      await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ description: "no name" })
        .expect(400);
      await agent
        .post(wsPath(id, "/projects"))
        .set(authHeader(owner.accessToken))
        .send({ description: "no name" })
        .expect(400);
      await agent
        .post(wsPath(id, "/invitations"))
        .set(authHeader(owner.accessToken))
        .send({ email: "bad@test.local" })
        .expect(400);
      await agent
        .post(wsPath(id, "/approvals"))
        .set(authHeader(owner.accessToken))
        .send({ title: "Missing code" })
        .expect(400);

      const teamRes = await agent
        .post(wsPath(id, "/teams"))
        .set(authHeader(owner.accessToken))
        .send({ name: "Bad Members Team" })
        .expect(201);
      const teamId = teamRes.body.team.id as string;

      await agent
        .post(wsPath(id, `/teams/${teamId}/members`))
        .set(authHeader(owner.accessToken))
        .send({})
        .expect(400);

      await agent
        .post(wsPath(id, "/team-assignments"))
        .set(authHeader(owner.accessToken))
        .send({ team_id: teamId })
        .expect(400);

      const membersRes = await agent
        .get(wsPath(id, "/members"))
        .set(authHeader(owner.accessToken))
        .expect(200);
      const memberRow = membersRes.body.members.find((m: { user_id: string }) => m.user_id === owner.id);

      await agent
        .patch(wsPath(id, `/members/${memberRow.id}/role`))
        .set(authHeader(owner.accessToken))
        .send({})
        .expect(400);
    });
  });
});
