/**
 * Advanced / complex QA scenarios — run: npm run complex-qa
 * Creates isolated CQA fixtures, executes multi-path tests, cleans up.
 */
import bcrypt from "bcryptjs";
import { db, initDb } from "../db.js";
import {
  addMember,
  removeMember,
  isWorkspaceOwner,
  changeMemberRole,
} from "../services/authorization.js";
import { seedDefaultRoles, getRoleBySlug } from "../services/workspaceRoles.js";
import { createTeam, setTeamLead, addTeamMember, removeTeamMember } from "../services/teams.js";
import {
  createProject,
  addProjectMember,
  removeProjectMember,
  setProjectTeams,
} from "../services/projects.js";
import {
  userCanAccessProject,
  resolveProjectAccess,
  assertSameWorkspaceTeamProject,
  listAccessibleProjectIds,
} from "../services/projectAccess.js";
import {
  requestTeamMembership,
  approveTeamJoinRequest,
  rejectTeamJoinRequest,
} from "../services/teamMembershipRequests.js";
import {
  createApprovalRequest,
  approveRequest,
} from "../services/approvalFlows.js";
import { resolvePermission } from "../services/permissionResolver.js";
import { authorize } from "../services/authorizationService.js";
import { validateSession, createSession, revokeSession } from "../services/sessions.js";
import { setRolePermissionEffects } from "../services/permissions.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, id: string, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${id}: ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${id}: ${label}`);
  }
}

function assertThrows(fn: () => unknown, id: string, label: string): void {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${id}: ${label} (expected throw)`);
  } catch {
    passed += 1;
    console.log(`  ✓ ${id}: ${label}`);
  }
}

interface CqaFixture {
  ahmedId: string;
  ownerAId: string;
  ownerBId: string;
  ownerCId: string;
  wsA: string;
  wsB: string;
  wsC: string;
  ahmedMemberA: string;
  ahmedMemberB: string;
  teamBackend: string;
  teamDevOps: string;
  teamQaB: string;
  projectAlpha: string;
  projectBeta: string;
  projectGamma: string;
  projectDelta: string;
  userIds: string[];
  workspaceIds: string[];
}

function createUser(username: string, email: string): string {
  const id = crypto.randomUUID();
  const uniqueEmail = email.replace("@", `+${id.slice(0, 8)}@`);
  const hash = bcrypt.hashSync("cqa1234", 10);
  db.prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    `${username}_${id.slice(0, 6)}`,
    uniqueEmail,
    hash
  );
  return id;
}

function createWorkspace(name: string, ownerUserId: string): string {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspaces (id, name, user_id, approval_flows_enabled)
    VALUES (?, ?, ?, 1)
  `).run(id, name, ownerUserId);
  const roles = seedDefaultRoles(id);
  addMember(id, ownerUserId, roles.owner.id);
  return id;
}

function setupFixture(): CqaFixture {
  const ownerAId = createUser("cqa_owner_a", "cqa_owner_a@test.local");
  const ownerBId = createUser("cqa_owner_b", "cqa_owner_b@test.local");
  const ownerCId = createUser("cqa_owner_c", "cqa_owner_c@test.local");
  const ahmedId = createUser("cqa_ahmed", "cqa_ahmed@test.local");

  const wsA = createWorkspace("CQA Workspace A", ownerAId);
  const wsB = createWorkspace("CQA Workspace B", ownerBId);
  const wsC = createWorkspace("CQA Workspace C", ownerCId);

  const rolesA = seedDefaultRoles(wsA);

  const ahmedMemberA = addMember(wsA, ahmedId, getRoleBySlug(wsA, "developer")!.id).id;
  const ahmedMemberB = addMember(wsB, ahmedId, getRoleBySlug(wsB, "admin")!.id).id;
  addMember(wsC, ahmedId, getRoleBySlug(wsC, "owner")!.id);

  const teamBackend = createTeam(ownerAId, wsA, { name: "Backend" }).id;
  const teamDevOps = createTeam(ownerAId, wsA, { name: "DevOps" }).id;
  addTeamMember(ownerAId, wsA, teamBackend, ahmedMemberA);
  addTeamMember(ownerAId, wsA, teamDevOps, ahmedMemberA);

  const teamQaB = createTeam(ownerBId, wsB, { name: "QA" }).id;
  addTeamMember(ownerBId, wsB, teamQaB, ahmedMemberB);

  const projectAlpha = createProject(ownerAId, wsA, { name: "Project Alpha" }).id;
  const projectBeta = createProject(ownerAId, wsA, { name: "Project Beta" }).id;
  const projectGamma = createProject(ownerAId, wsA, { name: "Project Gamma" }).id;
  const projectDelta = createProject(ownerBId, wsB, { name: "Project Delta" }).id;

  addProjectMember(ownerAId, wsA, projectAlpha, ahmedMemberA, "member");
  setProjectTeams(ownerAId, wsA, projectBeta, [teamBackend]);
  setProjectTeams(ownerAId, wsA, projectGamma, [teamDevOps]);
  addProjectMember(ownerBId, wsB, projectDelta, ahmedMemberB, "member");

  return {
    ahmedId,
    ownerAId,
    ownerBId,
    ownerCId,
    wsA,
    wsB,
    wsC,
    ahmedMemberA,
    ahmedMemberB,
    teamBackend,
    teamDevOps,
    teamQaB,
    projectAlpha,
    projectBeta,
    projectGamma,
    projectDelta,
    userIds: [ahmedId, ownerAId, ownerBId, ownerCId],
    workspaceIds: [wsA, wsB, wsC],
  };
}

function cleanupFixture(f: CqaFixture): void {
  const allUsers = db.prepare(`
    SELECT id FROM users WHERE username LIKE 'cqa_%'
  `).all() as { id: string }[];

  for (const wsId of f.workspaceIds) {
    db.prepare("DELETE FROM approval_requests WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM team_membership_requests WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM project_teams WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM project_members WHERE project_id IN (SELECT id FROM workspace_projects WHERE workspace_id = ?)").run(wsId);
    db.prepare("DELETE FROM workspace_projects WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM team_members WHERE team_id IN (SELECT id FROM workspace_teams WHERE workspace_id = ?)").run(wsId);
    db.prepare("DELETE FROM workspace_teams WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM workspace_member_permissions WHERE member_id IN (SELECT id FROM workspace_members WHERE workspace_id = ?)").run(wsId);
    db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM workspace_roles WHERE workspace_id = ?)").run(wsId);
    db.prepare("DELETE FROM workspace_roles WHERE workspace_id = ?").run(wsId);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(wsId);
  }

  for (const u of allUsers) {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(u.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
  }
}

function cleanupLeftoverCqa(): void {
  const cqaUsers = db.prepare("SELECT id FROM users WHERE username LIKE 'cqa_%'").all() as { id: string }[];
  const cqaWs = db.prepare("SELECT id FROM workspaces WHERE name LIKE 'CQA %'").all() as { id: string }[];
  for (const ws of cqaWs) {
    db.prepare("DELETE FROM approval_requests WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM team_membership_requests WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM project_teams WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM project_members WHERE project_id IN (SELECT id FROM workspace_projects WHERE workspace_id = ?)").run(ws.id);
    db.prepare("DELETE FROM workspace_projects WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM team_members WHERE team_id IN (SELECT id FROM workspace_teams WHERE workspace_id = ?)").run(ws.id);
    db.prepare("DELETE FROM workspace_teams WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM workspace_member_permissions WHERE member_id IN (SELECT id FROM workspace_members WHERE workspace_id = ?)").run(ws.id);
    db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM workspace_roles WHERE workspace_id = ?)").run(ws.id);
    db.prepare("DELETE FROM workspace_roles WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(ws.id);
  }
  for (const u of cqaUsers) {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(u.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
  }
}

console.log("Complex QA tests\n");
initDb();
cleanupLeftoverCqa();
const fx = setupFixture();

try {
  // CQA-001: Multi-workspace isolation
  const ahmedWs = db.prepare(`
    SELECT workspace_id FROM workspace_members WHERE user_id = ?
  `).all(fx.ahmedId) as { workspace_id: string }[];
  assert(ahmedWs.length === 3, "CQA-001", "Ahmed belongs to 3 workspaces");
  assert(
    !listAccessibleProjectIds(fx.ahmedId, fx.wsB).includes(fx.projectAlpha),
    "CQA-001b",
    "Workspace A project not in B accessible list"
  );
  assert(isWorkspaceOwner(fx.ahmedId, fx.wsC), "CQA-001c", "Ahmed is owner only in C");
  assert(!isWorkspaceOwner(fx.ahmedId, fx.wsA), "CQA-001d", "Ahmed is not owner in A");

  // CQA-002: Dual path — direct only on Alpha (no teams linked yet)
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, []);
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-002a", "Alpha direct access");
  removeProjectMember(fx.ownerAId, fx.wsA, fx.projectAlpha, fx.ahmedMemberA);
  assert(!userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-002b", "Lost access after direct removal");
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, [fx.teamBackend]);
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-002c", "Access restored via Backend team");
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, []);
  addProjectMember(fx.ownerAId, fx.wsA, fx.projectAlpha, fx.ahmedMemberA, "member");

  // CQA-003: Team-derived Beta access
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectBeta), "CQA-003a", "Beta via Backend team");
  removeTeamMember(fx.ownerAId, fx.wsA, fx.teamBackend, fx.ahmedMemberA);
  assert(!userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectBeta), "CQA-003b", "Beta lost after Backend removal");
  addTeamMember(fx.ownerAId, fx.wsA, fx.teamBackend, fx.ahmedMemberA);

  // CQA-004: Two teams on one project
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, [fx.teamBackend, fx.teamDevOps]);
  removeTeamMember(fx.ownerAId, fx.wsA, fx.teamBackend, fx.ahmedMemberA);
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-004", "Alpha via DevOps after Backend removed");
  addTeamMember(fx.ownerAId, fx.wsA, fx.teamBackend, fx.ahmedMemberA);

  // CQA-023: Team unlinked, direct remains
  addProjectMember(fx.ownerAId, fx.wsA, fx.projectAlpha, fx.ahmedMemberA, "member");
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, []);
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-023", "Direct access after teams unlinked");

  // CQA-024: Direct removed, team remains
  removeProjectMember(fx.ownerAId, fx.wsA, fx.projectAlpha, fx.ahmedMemberA);
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, [fx.teamBackend]);
  assert(userCanAccessProject(fx.ahmedId, fx.wsA, fx.projectAlpha), "CQA-024", "Team access after direct removed");
  assert(!resolveProjectAccess(fx.ahmedId, fx.wsA, fx.projectAlpha).directMember, "CQA-024b", "No direct member flag");

  // CQA-037: Duplicate project-team
  setProjectTeams(fx.ownerAId, fx.wsA, fx.projectAlpha, [fx.teamBackend, fx.teamBackend]);
  const ptCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM project_teams WHERE project_id = ? AND team_id = ? AND status = 'active'
  `).get(fx.projectAlpha, fx.teamBackend) as { c: number }).c;
  assert(ptCount === 1, "CQA-037", "Duplicate team link deduplicated");

  // CQA-043: Cross-workspace team/project
  assertThrows(
    () => assertSameWorkspaceTeamProject(fx.wsA, fx.projectAlpha, fx.teamQaB),
    "CQA-043",
    "Cross-workspace team/project rejected"
  );

  // CQA-016: Repeated team join requests
  const joiner = createUser("cqa_joiner", "cqa_joiner@test.local");
  const joinerMember = addMember(fx.wsA, joiner, getRoleBySlug(fx.wsA, "developer")!.id).id;
  const req1 = requestTeamMembership(joiner, fx.wsA, fx.teamDevOps, "first");
  rejectTeamJoinRequest(fx.ownerAId, req1.id, "no");
  const req2 = requestTeamMembership(joiner, fx.wsA, fx.teamDevOps, "second");
  rejectTeamJoinRequest(fx.ownerAId, req2.id, "no");
  const req3 = requestTeamMembership(joiner, fx.wsA, fx.teamDevOps, "third");
  assertThrows(
    () => requestTeamMembership(joiner, fx.wsA, fx.teamDevOps, "dup pending"),
    "CQA-016a",
    "Duplicate pending join blocked"
  );
  approveTeamJoinRequest(fx.ownerAId, req3.id);
  const tmCount = (db.prepare(`
    SELECT COUNT(*) AS c FROM team_members WHERE team_id = ? AND member_id = ?
  `).get(fx.teamDevOps, joinerMember) as { c: number }).c;
  assert(tmCount === 1, "CQA-016b", "Single membership after approve");

  // CQA-017: Team lead change blocks old lead
  const archTeam = createTeam(fx.ownerAId, fx.wsA, { name: "Architecture", lead_member_id: fx.ahmedMemberA }).id;
  const archReqUser = createUser("cqa_arch_req", "cqa_arch_req@test.local");
  const archReqMember = addMember(fx.wsA, archReqUser, getRoleBySlug(fx.wsA, "developer")!.id).id;
  const archReq = requestTeamMembership(archReqUser, fx.wsA, archTeam, "join");
  const newLeadUser = createUser("cqa_new_lead", "cqa_new_lead@test.local");
  const newLeadMember = addMember(fx.wsA, newLeadUser, getRoleBySlug(fx.wsA, "developer")!.id).id;
  setTeamLead(fx.ownerAId, fx.wsA, archTeam, newLeadMember);
  assertThrows(() => approveTeamJoinRequest(fx.ahmedId, archReq.id), "CQA-017a", "Former lead cannot approve");
  approveTeamJoinRequest(newLeadUser, archReq.id);
  assert(
    !!(db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND member_id = ?").get(archTeam, archReqMember)),
    "CQA-017b",
    "New lead approval succeeds"
  );

  // CQA-018: Removed member join approve fails
  const removedUser = createUser("cqa_removed", "cqa_removed@test.local");
  const removedMember = addMember(fx.wsA, removedUser, getRoleBySlug(fx.wsA, "developer")!.id).id;
  const remReq = requestTeamMembership(removedUser, fx.wsA, fx.teamBackend, "join");
  removeMember(fx.wsA, removedMember, fx.ownerAId);
  assertThrows(() => approveTeamJoinRequest(fx.ownerAId, remReq.id), "CQA-018", "Approve blocked for removed member");

  // CQA-010/009: Approval + permission changed to DENY
  const permUser = createUser("cqa_perm", "cqa_perm@test.local");
  addMember(fx.wsA, permUser, getRoleBySlug(fx.wsA, "developer")!.id);
  const memberRole = getRoleBySlug(fx.wsA, "developer")!;
  setRolePermissionEffects(memberRole.id, [{ permission_code: "project.delete", effect: "approval_required" }]);
  const approvalReq = createApprovalRequest(permUser, fx.wsA, "project.delete", "Need delete");
  setRolePermissionEffects(memberRole.id, [{ permission_code: "project.delete", effect: "deny" }]);
  assertThrows(() => approveRequest(fx.ownerAId, approvalReq.id), "CQA-010", "Approve fails when permission now DENY");
  const reqStatus = db.prepare("SELECT status FROM approval_requests WHERE id = ?").get(approvalReq.id) as {
    status: string;
  };
  assert(reqStatus.status === "failed", "CQA-010b", "Stale approval marked failed");
  assertThrows(
    () => createApprovalRequest(permUser, fx.wsA, "project.delete", "retry"),
    "CQA-009",
    "New request blocked when DENY"
  );

  // CQA-008: Fresh authorize resolves APPROVAL_REQUIRED (before any approval grants override)
  setRolePermissionEffects(memberRole.id, [{ permission_code: "task.delete", effect: "approval_required" }]);
  const authDel = authorize({ userId: permUser, workspaceId: fx.wsA, permission: "task.delete" });
  assert(authDel.requiresApproval && !authDel.allowed, "CQA-008", "Backend resolves APPROVAL_REQUIRED fresh");

  // CQA-012: Double approve
  setRolePermissionEffects(memberRole.id, [{ permission_code: "task.delete", effect: "approval_required" }]);
  const reqA = createApprovalRequest(permUser, fx.wsA, "task.delete", "del");
  approveRequest(fx.ownerAId, reqA.id);
  assertThrows(() => approveRequest(fx.ownerAId, reqA.id), "CQA-012", "Second approve rejected");

  // CQA-029: Revoked session
  const sess = createSession(fx.ownerAId);
  revokeSession(sess.id, fx.ownerAId);
  assert(validateSession(sess.id, fx.ownerAId) === null, "CQA-029", "Revoked session invalid");

  // CQA-059: Override DENY beats role ALLOW
  setRolePermissionEffects(memberRole.id, [{ permission_code: "task.view", effect: "allow" }]);
  const overrideUser = createUser("cqa_override", "cqa_override@test.local");
  const overrideMember = addMember(fx.wsA, overrideUser, memberRole.id);
  db.prepare(`
    INSERT INTO workspace_member_permissions (member_id, permission_code, effect) VALUES (?, 'task.view', 'deny')
  `).run(overrideMember.id);
  const viewRes = resolvePermission(overrideUser, fx.wsA, "task.view");
  assert(viewRes.denied && !viewRes.allowed, "CQA-059", "Override DENY wins over role ALLOW");

  // CQA-020: Remove from one workspace only
  const multiUser = createUser("cqa_multi", "cqa_multi@test.local");
  const multiMemberA = addMember(fx.wsA, multiUser, memberRole.id).id;
  addMember(fx.wsB, multiUser, getRoleBySlug(fx.wsB, "developer")!.id);
  removeMember(fx.wsA, multiMemberA, fx.ownerAId);
  const remaining = db.prepare("SELECT workspace_id FROM workspace_members WHERE user_id = ?").all(multiUser) as {
    workspace_id: string;
  }[];
  assert(remaining.length === 1 && remaining[0].workspace_id === fx.wsB, "CQA-020", "Workspace B remains");

  // CQA-048: Cannot assign owner role via role change
  const adminUser = createUser("cqa_admin_esc", "cqa_admin_esc@test.local");
  const adminMember = addMember(fx.wsA, adminUser, getRoleBySlug(fx.wsA, "admin")!.id).id;
  assertThrows(
    () => changeMemberRole(fx.wsA, adminMember, getRoleBySlug(fx.wsA, "owner")!.id, fx.ownerAId),
    "CQA-048",
    "Admin cannot be promoted to owner"
  );
} catch (e) {
  console.error("Complex QA fatal:", e);
  failed += 1;
} finally {
  cleanupFixture(fx);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
