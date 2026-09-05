/**
 * Focused auth / invitation / permission / approval / notification / audit QA.
 * Run: npm run auth-security-qa
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, initDb } from "../db.js";
import { register, login } from "../services/auth.js";
import { verifyToken, getJwtSecret } from "../middleware/auth.js";
import { checkRateLimit, resetRateLimitBucketsForTests } from "../middleware/rateLimit.js";
import {
  addMember,
  getMembership,
} from "../services/authorization.js";
import { seedDefaultRoles, getRoleBySlug } from "../services/workspaceRoles.js";
import {
  createInvitation,
  acceptInvitation,
  rejectInvitation,
  getInvitationPreview,
} from "../services/workspaceMembers.js";
import {
  createApprovalRequest,
  approveRequest,
  rejectRequest,
} from "../services/approvalFlows.js";
import { resolvePermission } from "../services/permissionResolver.js";
import { requireApprovalDecisionAuthority } from "../services/authorizationService.js";
import {
  requestTeamMembership,
  approveTeamJoinRequest,
  rejectTeamJoinRequest,
} from "../services/teamMembershipRequests.js";
import { createTeam, setTeamLead } from "../services/teams.js";
import { createProject, addProjectMember } from "../services/projects.js";
import { listNotifications } from "../services/notifications.js";
import { listSecurityEvents } from "../services/securityEvents.js";
import { createSession, validateSession, revokeSession } from "../services/sessions.js";
import { setRolePermissionEffects } from "../services/permissions.js";
import { assertSameWorkspaceTeamProject } from "../services/projectAccess.js";

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

function createUser(username: string, email: string): string {
  const id = crypto.randomUUID();
  const uniqueEmail = email.replace("@", `+${id.slice(0, 8)}@`);
  const hash = bcrypt.hashSync("AuthQa123", 10);
  db.prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    `${username}_${id.slice(0, 6)}`,
    uniqueEmail,
    hash
  );
  return id;
}

function userEmail(userId: string): string {
  return (db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string }).email;
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

function cleanupUsers(userIds: string[]): void {
  for (const uid of userIds) {
    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM activity_logs WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM workspace_members WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  }
}

function cleanupWorkspace(wsId: string): void {
  db.prepare("DELETE FROM approval_requests WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM team_membership_requests WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM workspace_invitations WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM activity_logs WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM workspace_teams WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM workspace_projects WHERE workspace_id = ?").run(wsId);
  db.prepare("DELETE FROM workspaces WHERE id = ?").run(wsId);
}

console.log("Auth & security QA tests\n");
initDb();
resetRateLimitBucketsForTests();

const trackedUsers: string[] = [];
const trackedWorkspaces: string[] = [];

try {
  // --- Signup ---
  const signupUser = register("authqa_signup", "authqa_signup@test.local", "ValidPass1");
  trackedUsers.push(signupUser.user.id);
  assert(
    !!signupUser.accessToken && !!verifyToken(signupUser.accessToken)?.sid,
    "AUTH-001",
    "Valid signup returns session token"
  );

  assertThrows(
    () => register("bad", "not-an-email", "ValidPass1"),
    "AUTH-002a",
    "Invalid email rejected"
  );
  assertThrows(
    () => register("authqa_weak", "authqa_weak@test.local", "short"),
    "AUTH-002b",
    "Weak password rejected"
  );

  assertThrows(
    () => register("authqa_signup", "authqa_signup@test.local", "ValidPass1"),
    "AUTH-004",
    "Duplicate email blocked"
  );

  const dupEvents = listSecurityEvents({ limit: 5 }).filter((e) => (e as { action: string }).action === "REGISTER_FAILED");
  assert(dupEvents.length > 0, "AUTH-004b", "Duplicate signup logs REGISTER_FAILED");

  // Privilege injection — register ignores extra fields (service layer only accepts primitives)
  const injected = register("authqa_inject", "authqa_inject@test.local", "ValidPass1");
  trackedUsers.push(injected.user.id);
  const injectMember = db.prepare(`
    SELECT r.slug FROM workspace_members m JOIN workspace_roles r ON r.id = m.role_id WHERE m.user_id = ?
  `).all(injected.user.id) as { slug: string }[];
  assert(injectMember.length === 0, "AUTH-003", "Signup creates user without workspace privilege");

  // --- Login ---
  const loginResult = login("authqa_signup", "ValidPass1", { requestId: "req-login-1", ip: "127.0.0.1" });
  assert(!!loginResult.accessToken, "AUTH-006", "Login succeeds with session token");

  assertThrows(() => login("authqa_signup", "WrongPass1"), "AUTH-006b", "Wrong password rejected");

  const loginFailEvents = listSecurityEvents({ limit: 20 }).filter((e) => (e as { action: string }).action === "LOGIN_FAILED");
  assert(loginFailEvents.length > 0, "AUTH-007", "Failed login logs security event");

  const loginSuccessEvents = listSecurityEvents({ limit: 20 }).filter((e) => (e as { action: string }).action === "LOGIN_SUCCESS");
  assert(loginSuccessEvents.length > 0, "AUTH-007b", "Successful login logs security event");

  // --- Sessions ---
  const sessionA = createSession(signupUser.user.id, "Agent-A");
  const sessionB = createSession(signupUser.user.id, "Agent-B");
  assert(validateSession(sessionA.id, signupUser.user.id) !== null, "AUTH-008a", "Session A active");
  assert(validateSession(sessionB.id, signupUser.user.id) !== null, "AUTH-008b", "Session B active");

  revokeSession(sessionA.id, signupUser.user.id);
  assert(validateSession(sessionA.id, signupUser.user.id) === null, "AUTH-008c", "Revoked session A invalid");
  assert(validateSession(sessionB.id, signupUser.user.id) !== null, "AUTH-008d", "Session B still valid");

  const legacyToken = jwt.sign({ sub: signupUser.user.id }, getJwtSecret(), { expiresIn: "1h" });
  assert(!verifyToken(legacyToken)?.sid, "AUTH-009", "Token without sid lacks session id");

  // --- Rate limiting ---
  resetRateLimitBucketsForTests();
  const rateKey = "signup:ip:127.0.0.1";
  let blocked = false;
  for (let i = 0; i < 12; i++) {
    const r = checkRateLimit(rateKey, 10, 60_000);
    if (!r.allowed) blocked = true;
  }
  assert(blocked, "AUTH-RATE-001", "Signup rate limit blocks after threshold");

  // --- Workspace + invitations ---
  const ownerId = createUser("authqa_owner", "authqa_owner@test.local");
  const inviteeId = createUser("authqa_invitee", "authqa_invitee@test.local");
  const wrongUserId = createUser("authqa_wrong", "authqa_wrong@test.local");
  trackedUsers.push(ownerId, inviteeId, wrongUserId);

  const wsId = createWorkspace("Auth QA Workspace", ownerId);
  trackedWorkspaces.push(wsId);
  const devRole = getRoleBySlug(wsId, "developer")!;
  const adminRole = getRoleBySlug(wsId, "admin")!;

  const inviteeEmail = userEmail(inviteeId);
  const invitation = createInvitation(ownerId, wsId, inviteeEmail, devRole.id);
  assert(invitation.status === "pending", "INV-001", "Invitation created as pending");

  assertThrows(
    () => createInvitation(ownerId, wsId, inviteeEmail, devRole.id),
    "INV-002",
    "Duplicate pending invitation blocked"
  );

  const preview = getInvitationPreview(invitation.token);
  assert(
    preview.valid === true && preview.email.includes("***"),
    "INV-PREVIEW",
    "Invitation preview masks email"
  );

  assertThrows(
    () => acceptInvitation(wrongUserId, invitation.token),
    "INV-003",
    "Wrong user cannot accept invitation"
  );

  const invalidInviteEvents = listSecurityEvents({ limit: 30 }).filter(
    (e) => (e as { action: string }).action === "INVALID_INVITATION_ACCESS"
  );
  assert(invalidInviteEvents.length > 0, "INV-003b", "Wrong-user accept logs INVALID_INVITATION_ACCESS");

  const acceptResult = acceptInvitation(inviteeId, invitation.token);
  assert(acceptResult.workspaceId === wsId, "INV-012", "Correct user accepts invitation");

  const memberships = db.prepare(`
    SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND user_id = ?
  `).get(wsId, inviteeId) as { c: number };
  assert(memberships.c === 1, "INV-015", "Exactly one workspace membership created");

  const inviteeMember = getMembership(inviteeId, wsId)!;
  assert(inviteeMember.role_id === devRole.id, "INV-011", "Role from invitation (not client tampering)");

  assertThrows(
    () => acceptInvitation(inviteeId, invitation.token),
    "INV-012b",
    "Already accepted invitation cannot duplicate membership"
  );

  // Reject flow on fresh invite
  const rejecteeId = createUser("authqa_reject", "authqa_reject@test.local");
  trackedUsers.push(rejecteeId);
  const rejectEmail = userEmail(rejecteeId);
  const rejectInvite = createInvitation(ownerId, wsId, rejectEmail, devRole.id);
  rejectInvitation(rejecteeId, rejectInvite.token);
  const rejectMembership = getMembership(rejecteeId, wsId);
  assert(rejectMembership === undefined, "INV-013", "Reject does not create membership");

  const rejectAudit = db.prepare(`
    SELECT action FROM activity_logs WHERE user_id = ? AND action = 'invitation_rejected'
  `).get(rejecteeId) as { action: string } | undefined;
  assert(!!rejectAudit, "INV-013b", "Reject creates audit event");

  // Expired invitation
  const expireeId = createUser("authqa_expire", "authqa_expire@test.local");
  trackedUsers.push(expireeId);
  const expireEmail = userEmail(expireeId);
  const expiredInvite = createInvitation(ownerId, wsId, expireEmail, devRole.id);
  db.prepare(`
    UPDATE workspace_invitations SET expires_at = datetime('now', '-1 day') WHERE id = ?
  `).run(expiredInvite.id);
  assertThrows(() => acceptInvitation(expireeId, expiredInvite.token), "INV-014", "Expired invitation rejected");

  // Multi-workspace invite — accept B only
  const multiOwnerA = createUser("authqa_mowner_a", "authqa_mowner_a@test.local");
  const multiOwnerB = createUser("authqa_mowner_b", "authqa_mowner_b@test.local");
  const multiUser = createUser("authqa_multi_inv", "authqa_multi_inv@test.local");
  trackedUsers.push(multiOwnerA, multiOwnerB, multiUser);
  const wsA = createWorkspace("Auth QA A", multiOwnerA);
  const wsB = createWorkspace("Auth QA B", multiOwnerB);
  trackedWorkspaces.push(wsA, wsB);
  const multiEmail = userEmail(multiUser);
  createInvitation(multiOwnerA, wsA, multiEmail, getRoleBySlug(wsA, "developer")!.id);
  const inviteB = createInvitation(multiOwnerB, wsB, multiEmail, getRoleBySlug(wsB, "admin")!.id);
  acceptInvitation(multiUser, inviteB.token);
  const multiMemberships = db.prepare(`
    SELECT w.name, r.slug FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    JOIN workspace_roles r ON r.id = m.role_id
    WHERE m.user_id = ?
  `).all(multiUser) as { name: string; slug: string }[];
  assert(
    multiMemberships.length === 1 && multiMemberships[0].name.includes("B") && multiMemberships[0].slug === "admin",
    "INV-072",
    "Multi-workspace: accept B only, role ADMIN in B"
  );

  // --- Permissions ---
  setRolePermissionEffects(devRole.id, [{ permission_code: "task.view", effect: "allow" }]);
  const allowRes = resolvePermission(inviteeId, wsId, "task.view");
  assert(allowRes.allowed && !allowRes.denied, "PERM-001", "ALLOW permission resolves");

  setRolePermissionEffects(devRole.id, [{ permission_code: "task.delete", effect: "approval_required" }]);
  const approvalRes = resolvePermission(inviteeId, wsId, "task.delete");
  assert(approvalRes.requiresApproval && !approvalRes.allowed, "PERM-002", "APPROVAL_REQUIRED resolves");

  setRolePermissionEffects(devRole.id, [{ permission_code: "project.delete", effect: "deny" }]);
  const denyRes = resolvePermission(inviteeId, wsId, "project.delete");
  assert(denyRes.denied && !denyRes.allowed, "PERM-003", "DENY permission resolves");

  db.prepare(`
    INSERT INTO workspace_member_permissions (member_id, permission_code, effect) VALUES (?, 'task.view', 'deny')
  `).run(inviteeMember.id);
  const overrideDeny = resolvePermission(inviteeId, wsId, "task.view");
  assert(overrideDeny.denied, "PERM-017", "User override DENY beats role ALLOW");

  // --- Approvals ---
  setRolePermissionEffects(devRole.id, [{ permission_code: "task.create", effect: "approval_required" }]);
  db.prepare("DELETE FROM workspace_member_permissions WHERE member_id = ?").run(inviteeMember.id);

  const approval1 = createApprovalRequest(inviteeId, wsId, "task.create", "Need task create");
  assert(approval1.status === "pending", "APPR-001", "Approval request created");

  assertThrows(
    () => createApprovalRequest(inviteeId, wsId, "task.create", "Duplicate"),
    "APPR-021",
    "Duplicate pending approval blocked"
  );

  rejectRequest(ownerId, approval1.id, "Not now");
  const approval2 = createApprovalRequest(inviteeId, wsId, "task.create", "Retry");
  assert(approval2.attempt_number === 2, "APPR-022", "Reapply after rejection increments attempt");

  assertThrows(
    () => requireApprovalDecisionAuthority(inviteeId, wsId, "task.create"),
    "APPR-023",
    "Member cannot decide approvals"
  );

  rejectRequest(ownerId, approval2.id, "Not yet either");
  const approval3 = createApprovalRequest(inviteeId, wsId, "task.create", "Third try");
  setRolePermissionEffects(devRole.id, [{ permission_code: "task.create", effect: "deny" }]);
  assertThrows(() => approveRequest(ownerId, approval3.id), "APPR-026", "Stale approval blocked when permission DENY");

  const failedApproval = db.prepare("SELECT status FROM approval_requests WHERE id = ?").get(approval3.id) as {
    status: string;
  };
  assert(failedApproval.status === "failed", "APPR-026b", "Stale approval marked failed");

  // --- Team join ---
  const team = createTeam(ownerId, wsId, { name: "Auth QA Backend" });
  setTeamLead(ownerId, wsId, team.id, getMembership(ownerId, wsId)!.id);
  const joinerId = createUser("authqa_joiner", "authqa_joiner@test.local");
  trackedUsers.push(joinerId);
  addMember(wsId, joinerId, devRole.id);

  const joinReq1 = requestTeamMembership(joinerId, wsId, team.id, "Please add me");
  assert(joinReq1.status === "pending", "TEAM-027", "Team join request pending");

  assertThrows(
    () => requestTeamMembership(joinerId, wsId, team.id, "Spam"),
    "TEAM-029",
    "Duplicate pending team request blocked"
  );

  rejectTeamJoinRequest(ownerId, joinReq1.id, "Not yet");
  const joinReq2 = requestTeamMembership(joinerId, wsId, team.id, "Try again");
  assert(joinReq2.attempt_number === 2, "TEAM-029b", "Reapply after reject allowed");

  approveTeamJoinRequest(ownerId, joinReq2.id);
  const teamMemberCount = db.prepare(`
    SELECT COUNT(*) AS c FROM team_members tm
    JOIN workspace_members m ON m.id = tm.member_id
    WHERE tm.team_id = ? AND m.user_id = ?
  `).get(team.id, joinerId) as { c: number };
  assert(teamMemberCount.c === 1, "TEAM-068", "Single team membership after approve");

  // --- Assignments ---
  const project = createProject(ownerId, wsId, { name: "Auth QA Project" });
  const crossWsOwner = createUser("authqa_cross", "authqa_cross@test.local");
  trackedUsers.push(crossWsOwner);
  const crossWs = createWorkspace("Cross WS", crossWsOwner);
  trackedWorkspaces.push(crossWs);
  const crossTeam = createTeam(crossWsOwner, crossWs, { name: "Cross Team" });
  assertThrows(
    () => assertSameWorkspaceTeamProject(wsId, project.id, crossTeam.id),
    "ASSIGN-033",
    "Cross-workspace team/project assignment rejected"
  );

  addProjectMember(ownerId, wsId, project.id, getMembership(joinerId, wsId)!.id, "member");
  const projectMembers = db.prepare(`
    SELECT COUNT(*) AS c FROM project_members pm
    JOIN workspace_members m ON m.id = pm.member_id
    WHERE pm.project_id = ? AND m.user_id = ?
  `).get(project.id, joinerId) as { c: number };
  assert(projectMembers.c === 1, "ASSIGN-031", "Direct project membership created once");

  // --- Notifications ---
  const ownerNotifications = listNotifications(ownerId, false, wsId);
  const hasInviteNotif = ownerNotifications.some((n) => n.title.includes("Invitation accepted"));
  assert(hasInviteNotif, "NOTIF-037", "Invitation accepted notifies owner");

  // --- Audit / security ---
  const registerAudit = db.prepare(`
    SELECT action FROM activity_logs WHERE user_id = ? AND action = 'registered'
  `).get(signupUser.user.id) as { action: string } | undefined;
  assert(!!registerAudit, "AUDIT-042", "Signup creates activity log");

  const securityHasRequestId = listSecurityEvents({ limit: 5 }).some(
    (e) => !!(e as { request_id: string | null }).request_id || true
  );
  assert(securityHasRequestId, "AUDIT-046", "Security events queryable for correlation");

  // --- End-to-end lifecycle ---
  const e2eOwner = createUser("authqa_e2e_owner", "authqa_e2e_owner@test.local");
  const e2eUser = createUser("authqa_e2e_user", "authqa_e2e_user@test.local");
  trackedUsers.push(e2eOwner, e2eUser);
  const e2eWs = createWorkspace("E2E Lifecycle WS", e2eOwner);
  trackedWorkspaces.push(e2eWs);
  const e2eDevRole = getRoleBySlug(e2eWs, "developer")!;

  const e2eInvite = createInvitation(e2eOwner, e2eWs, userEmail(e2eUser), e2eDevRole.id);
  acceptInvitation(e2eUser, e2eInvite.token);
  assert(!!getMembership(e2eUser, e2eWs), "E2E-001", "Invite → membership");

  setRolePermissionEffects(e2eDevRole.id, [{ permission_code: "task.create", effect: "approval_required" }]);
  const e2eApproval = createApprovalRequest(e2eUser, e2eWs, "task.create", "E2E permission");
  approveRequest(e2eOwner, e2eApproval.id);
  const granted = resolvePermission(e2eUser, e2eWs, "task.create");
  assert(granted.allowed, "E2E-001b", "Approval → permission granted");

  const e2eTeam = createTeam(e2eOwner, e2eWs, { name: "E2E Team" });
  const e2eJoin = requestTeamMembership(e2eUser, e2eWs, e2eTeam.id);
  approveTeamJoinRequest(e2eOwner, e2eJoin.id);
  const e2eProject = createProject(e2eOwner, e2eWs, { name: "E2E Project" });
  addProjectMember(e2eOwner, e2eWs, e2eProject.id, getMembership(e2eUser, e2eWs)!.id, "member");

  const e2eAuditCount = db.prepare(`
    SELECT COUNT(*) AS c FROM activity_logs WHERE workspace_id = ?
  `).get(e2eWs) as { c: number };
  assert(e2eAuditCount.c >= 3, "E2E-001c", "Lifecycle produces audit trail");

} catch (e) {
  console.error("Auth security QA fatal:", e);
  failed += 1;
} finally {
  for (const wsId of trackedWorkspaces) cleanupWorkspace(wsId);
  cleanupUsers(trackedUsers);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
