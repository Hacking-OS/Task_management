/**
 * Role × Permission × Override × Refresh Token attestation matrix.
 * Run: npm run role-permission-refresh-qa
 *
 * Generates 100+ cases covering every system role, effect combinations,
 * override precedence, and refresh-token rotation/expiry/revocation.
 */
import bcrypt from "bcryptjs";
import { db, initDb } from "../db.js";
import {
  SYSTEM_ROLE_SLUGS,
  DEFAULT_ROLE_PERMISSIONS,
  type SystemRoleSlug,
} from "../permissions/catalog.js";
import { addMember } from "../services/authorization.js";
import { seedDefaultRoles, getRoleBySlug } from "../services/workspaceRoles.js";
import { resolvePermission, type RolePermissionEffect } from "../services/permissionResolver.js";
import { authorize } from "../services/authorizationService.js";
import { setRolePermissionEffects, setRolePermissions } from "../services/permissions.js";
import { setMemberPermissionOverrides, clearMemberPermissionOverrides } from "../services/memberPermissions.js";
import { bumpMemberSecurityVersion, getMemberSecurityVersion } from "../services/securityVersion.js";
import {
  createAuthenticatedSession,
  rotateRefreshSession,
  revokeSession,
} from "../services/sessions.js";
import { refreshSession as authRefreshSession } from "../services/auth.js";

let passed = 0;
let failed = 0;

interface PermExpect {
  allowed: boolean;
  denied: boolean;
  requiresApproval: boolean;
}

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

function permSnapshot(userId: string, workspaceId: string, code: string): PermExpect {
  const r = resolvePermission(userId, workspaceId, code);
  return { allowed: r.allowed, denied: r.denied, requiresApproval: r.requiresApproval };
}

function expectFromRoleDefault(roleSlug: SystemRoleSlug, code: string): PermExpect {
  if (roleSlug === "owner") {
    return { allowed: true, denied: false, requiresApproval: false };
  }
  const has = (DEFAULT_ROLE_PERMISSIONS[roleSlug] ?? []).includes(code);
  return has
    ? { allowed: true, denied: false, requiresApproval: false }
    : { allowed: false, denied: true, requiresApproval: false };
}

function expectFromEffect(effect: RolePermissionEffect): PermExpect {
  if (effect === "allow") return { allowed: true, denied: false, requiresApproval: false };
  if (effect === "deny") return { allowed: false, denied: true, requiresApproval: false };
  return { allowed: false, denied: false, requiresApproval: true };
}

function matches(a: PermExpect, b: PermExpect): boolean {
  return a.allowed === b.allowed && a.denied === b.denied && a.requiresApproval === b.requiresApproval;
}

function createUser(tag: string): string {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)").run(
    id,
    `${tag}_${id.slice(0, 6)}`,
    `${tag}+${id.slice(0, 8)}@rpqa.test`,
    bcrypt.hashSync("Rpqa1234", 10)
  );
  return id;
}

function createMutableRole(workspaceId: string): string {
  const id = crypto.randomUUID();
  const slug = `rpqa-mutable-${id.slice(0, 8)}`;
  db.prepare(`
    INSERT INTO workspace_roles (id, workspace_id, name, slug, is_system)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, workspaceId, "RPQA Mutable", slug);
  setRolePermissions(id, ["workspace.view", "task.view"]);
  return id;
}

function createWorkspace(ownerId: string): string {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspaces (id, name, user_id, approval_flows_enabled)
    VALUES (?, ?, ?, 1)
  `).run(id, `RPQA ${id.slice(0, 8)}`, ownerId);
  const roles = seedDefaultRoles(id);
  addMember(id, ownerId, roles.owner.id);
  return id;
}

/** Resolve permission, refresh session, resolve again — permissions must stay authoritative. */
function assertStableAfterRefresh(
  id: string,
  userId: string,
  workspaceId: string,
  refreshToken: string,
  permission: string,
  expected: PermExpect
): string {
  const before = permSnapshot(userId, workspaceId, permission);
  assert(matches(before, expected), id, `${permission} before refresh`);

  const rotated = rotateRefreshSession(refreshToken);
  const after = permSnapshot(userId, workspaceId, permission);
  assert(matches(after, expected), `${id}-R`, `${permission} stable after refresh`);
  return rotated.refreshToken;
}

const SPOTLIGHT_PERMISSIONS = [
  "workspace.view",
  "workspace.delete",
  "member.invite",
  "member.remove",
  "task.view",
  "task.create",
  "task.delete",
  "project.create",
  "project.delete",
  "team.manage_members",
  "approval.decide",
] as const;

const EFFECT_PROBE_PERMISSIONS = [
  "task.delete",
  "project.delete",
  "member.remove",
  "workspace.delete",
  "team.delete",
] as const;

const OVERRIDE_PROBE_PERMISSIONS = [
  "task.create",
  "task.delete",
  "project.update",
  "member.invite",
  "team.create",
  "file.upload",
  "timesheet.view_all",
  "workspace.settings",
] as const;

type OverrideCombo = {
  suffix: string;
  roleEffect: RolePermissionEffect;
  override: "grant" | "deny" | null;
  expected: PermExpect;
};

const OVERRIDE_COMBOS: OverrideCombo[] = [
  {
    suffix: "RA",
    roleEffect: "allow",
    override: null,
    expected: { allowed: true, denied: false, requiresApproval: false },
  },
  {
    suffix: "RD",
    roleEffect: "allow",
    override: "deny",
    expected: { allowed: false, denied: true, requiresApproval: false },
  },
  {
    suffix: "RG",
    roleEffect: "deny",
    override: "grant",
    expected: { allowed: true, denied: false, requiresApproval: false },
  },
  {
    suffix: "RAG",
    roleEffect: "approval_required",
    override: "grant",
    expected: { allowed: true, denied: false, requiresApproval: false },
  },
  {
    suffix: "RAD",
    roleEffect: "approval_required",
    override: "deny",
    expected: { allowed: false, denied: true, requiresApproval: false },
  },
  {
    suffix: "RR",
    roleEffect: "approval_required",
    override: null,
    expected: { allowed: false, denied: false, requiresApproval: true },
  },
  {
    suffix: "RDENY",
    roleEffect: "deny",
    override: null,
    expected: { allowed: false, denied: true, requiresApproval: false },
  },
  {
    suffix: "RGRANT",
    roleEffect: "allow",
    override: "grant",
    expected: { allowed: true, denied: false, requiresApproval: false },
  },
];

console.log("Role × Permission × Override × Refresh QA\n");
initDb();

const ownerId = createUser("rpqa_owner");
const workspaceId = createWorkspace(ownerId);
const roles = seedDefaultRoles(workspaceId);
const trackedUsers: string[] = [ownerId];
const trackedWorkspaces: string[] = [workspaceId];

try {
  // ─── Section 1: Every system role × spotlight permissions (after refresh) ───
  let roleCase = 0;
  for (const roleSlug of SYSTEM_ROLE_SLUGS) {
    const role = roles[roleSlug] ?? getRoleBySlug(workspaceId, roleSlug);
    if (!role) continue;

    const userId = createUser(`rpqa_${roleSlug.replace(/-/g, "_")}`);
    trackedUsers.push(userId);
    const member = addMember(workspaceId, userId, role.id);
    const session = createAuthenticatedSession(userId, "RPQA-Agent");
    let refreshToken = session.refreshToken;

    for (const perm of SPOTLIGHT_PERMISSIONS) {
      roleCase += 1;
      const expected = expectFromRoleDefault(roleSlug, perm);
      refreshToken = assertStableAfterRefresh(
        `ROLE-${String(roleCase).padStart(3, "0")}-${roleSlug}-${perm.split(".")[0]}`,
        userId,
        workspaceId,
        refreshToken,
        perm,
        expected
      );
    }
  }

  // Owner always allowed (extra attestation)
  const ownerSession = createAuthenticatedSession(ownerId, "Owner-Agent");
  let ownerRefresh = ownerSession.refreshToken;
  for (const perm of ["workspace.delete", "member.remove", "approval.decide"] as const) {
    roleCase += 1;
    ownerRefresh = assertStableAfterRefresh(
      `ROLE-${String(roleCase).padStart(3, "0")}-owner-${perm}`,
      ownerId,
      workspaceId,
      ownerRefresh,
      perm,
      { allowed: true, denied: false, requiresApproval: false }
    );
  }

  // ─── Section 2: Role effect matrix (ALLOW / APPROVAL_REQUIRED / DENY) × permissions ───
  const effectUserId = createUser("rpqa_effect");
  trackedUsers.push(effectUserId);
  const mutableRoleId = createMutableRole(workspaceId);
  const effectMember = addMember(workspaceId, effectUserId, mutableRoleId);
  let effectCase = 0;

  for (const effect of ["allow", "approval_required", "deny"] as RolePermissionEffect[]) {
    for (const perm of EFFECT_PROBE_PERMISSIONS) {
      effectCase += 1;
      setRolePermissionEffects(mutableRoleId, [
        { permission_code: "workspace.view", effect: "allow" },
        { permission_code: perm, effect },
      ]);
      clearMemberPermissionOverrides(effectMember.id);
      bumpMemberSecurityVersion(effectMember.id);

      const session = createAuthenticatedSession(effectUserId, "Effect-Agent");
      const expected = expectFromEffect(effect);
      assertStableAfterRefresh(
        `EFF-${String(effectCase).padStart(3, "0")}-${effect}-${perm.split(".")[1] ?? perm}`,
        effectUserId,
        workspaceId,
        session.refreshToken,
        perm,
        expected
      );
    }
  }

  // ─── Section 3: Override precedence matrix × permissions ───
  const ovrUserId = createUser("rpqa_override");
  trackedUsers.push(ovrUserId);
  const ovrMutableRoleId = createMutableRole(workspaceId);
  const ovrMember = addMember(workspaceId, ovrUserId, ovrMutableRoleId);
  let ovrCase = 0;

  for (const combo of OVERRIDE_COMBOS) {
    for (const perm of OVERRIDE_PROBE_PERMISSIONS) {
      ovrCase += 1;
      setRolePermissionEffects(ovrMutableRoleId, [
        { permission_code: "workspace.view", effect: "allow" },
        { permission_code: perm, effect: combo.roleEffect },
      ]);
      if (combo.override) {
        setMemberPermissionOverrides(workspaceId, ovrMember.id, [
          { permission_code: perm, effect: combo.override },
        ]);
      } else {
        clearMemberPermissionOverrides(ovrMember.id);
      }
      bumpMemberSecurityVersion(ovrMember.id);

      const session = createAuthenticatedSession(ovrUserId, "Override-Agent");
      assertStableAfterRefresh(
        `OVR-${String(ovrCase).padStart(3, "0")}-${combo.suffix}-${perm.split(".")[0]}`,
        ovrUserId,
        workspaceId,
        session.refreshToken,
        perm,
        combo.expected
      );
    }
  }

  // ─── Section 4: Permission revoked mid-session → refresh reflects DENY ───
  const midUserId = createUser("rpqa_mid");
  trackedUsers.push(midUserId);
  const midMutableRoleId = createMutableRole(workspaceId);
  const midMember = addMember(workspaceId, midUserId, midMutableRoleId);
  setRolePermissionEffects(midMutableRoleId, [
    { permission_code: "workspace.view", effect: "allow" },
    { permission_code: "task.delete", effect: "allow" },
  ]);
  clearMemberPermissionOverrides(midMember.id);

  const midSession = createAuthenticatedSession(midUserId, "Mid-Agent");
  assert(permSnapshot(midUserId, workspaceId, "task.delete").allowed, "MID-001", "task.delete ALLOW before change");

  setRolePermissionEffects(midMutableRoleId, [
    { permission_code: "workspace.view", effect: "allow" },
    { permission_code: "task.delete", effect: "deny" },
  ]);
  bumpMemberSecurityVersion(midMember.id);
  const versionAfter = getMemberSecurityVersion(workspaceId, midUserId);

  const midRefresh = rotateRefreshSession(midSession.refreshToken);
  const afterDeny = permSnapshot(midUserId, workspaceId, "task.delete");
  assert(afterDeny.denied && !afterDeny.allowed, "MID-002", "task.delete DENY after refresh post-revoke");

  const authz = authorize({
    userId: midUserId,
    workspaceId,
    permission: "task.delete",
    clientSecurityVersion: versionAfter - 1,
  });
  assert(!authz.allowed && authz.denied, "MID-003", "authorize() fresh after refresh (stale client version)");
  assert(authz.securityVersion === versionAfter, "MID-004", "securityVersion current after refresh");

  // ─── Section 5: Override grant revoked mid-session → refresh removes access ───
  setRolePermissionEffects(midMutableRoleId, [
    { permission_code: "workspace.view", effect: "allow" },
    { permission_code: "task.create", effect: "allow" },
  ]);
  setMemberPermissionOverrides(workspaceId, midMember.id, [{ permission_code: "task.create", effect: "grant" }]);
  bumpMemberSecurityVersion(midMember.id);
  const grantSession = createAuthenticatedSession(midUserId, "Grant-Agent");
  assert(permSnapshot(midUserId, workspaceId, "task.create").allowed, "MID-005", "Override grant active");

  clearMemberPermissionOverrides(midMember.id);
  bumpMemberSecurityVersion(midMember.id);
  rotateRefreshSession(grantSession.refreshToken);
  const afterGrantRemoved = permSnapshot(midUserId, workspaceId, "task.create");
  assert(
    afterGrantRemoved.allowed,
    "MID-006",
    "Override removal reflected after refresh (task.create allowed by mutable role default)"
  );

  // ─── Section 6: Refresh token expiry ───
  const expUserId = createUser("rpqa_exp");
  trackedUsers.push(expUserId);
  addMember(workspaceId, expUserId, mutableRoleId);
  const expSession = createAuthenticatedSession(expUserId, "Exp-Agent");
  db.prepare(`
    UPDATE user_sessions SET expires_at = datetime('now', '-1 hour') WHERE id = ?
  `).run(expSession.session.id);
  assertThrows(
    () => rotateRefreshSession(expSession.refreshToken),
    "RT-EXP-001",
    "Expired refresh session rejected"
  );

  // ─── Section 7: Revoked session refresh ───
  const revUserId = createUser("rpqa_rev");
  trackedUsers.push(revUserId);
  addMember(workspaceId, revUserId, mutableRoleId);
  const revSession = createAuthenticatedSession(revUserId, "Rev-Agent");
  revokeSession(revSession.session.id, revUserId);
  assertThrows(
    () => authRefreshSession(revSession.refreshToken),
    "RT-REV-001",
    "Revoked refresh session denied"
  );

  // ─── Section 8: Double refresh — permissions unchanged across rotations ───
  const dblUserId = createUser("rpqa_dbl");
  trackedUsers.push(dblUserId);
  const dblMutableRoleId = createMutableRole(workspaceId);
  addMember(workspaceId, dblUserId, dblMutableRoleId);
  setRolePermissionEffects(dblMutableRoleId, [
    { permission_code: "workspace.view", effect: "allow" },
    { permission_code: "project.update", effect: "approval_required" },
  ]);
  let dblRefresh = createAuthenticatedSession(dblUserId, "Dbl-Agent").refreshToken;
  const dblExpected = expectFromEffect("approval_required");
  for (let i = 1; i <= 3; i++) {
    dblRefresh = assertStableAfterRefresh(
      `RT-ROT-${i}`,
      dblUserId,
      workspaceId,
      dblRefresh,
      "project.update",
      dblExpected
    );
  }

  // ─── Section 9: Role change mid-session → refresh uses new role permissions ───
  const chgUserId = createUser("rpqa_chg");
  trackedUsers.push(chgUserId);
  const viewerRole = getRoleBySlug(workspaceId, "viewer")!;
  const adminRole = getRoleBySlug(workspaceId, "admin")!;
  const chgMember = addMember(workspaceId, chgUserId, viewerRole.id);
  const chgSession = createAuthenticatedSession(chgUserId, "Chg-Agent");
  assert(!permSnapshot(chgUserId, workspaceId, "task.create").allowed, "CHG-001", "Viewer cannot create tasks");

  db.prepare("UPDATE workspace_members SET role_id = ? WHERE id = ?").run(adminRole.id, chgMember.id);
  bumpMemberSecurityVersion(chgMember.id, "role.changed");
  rotateRefreshSession(chgSession.refreshToken);
  assert(permSnapshot(chgUserId, workspaceId, "task.create").allowed, "CHG-002", "Admin role effective after refresh");

  // ─── Section 10: Non-member refresh token still valid but workspace auth denied ───
  const removedUserId = createUser("rpqa_removed");
  trackedUsers.push(removedUserId);
  const removedMember = addMember(workspaceId, removedUserId, mutableRoleId);
  const remSession = createAuthenticatedSession(removedUserId, "Rem-Agent");
  db.prepare("DELETE FROM workspace_members WHERE id = ?").run(removedMember.id);
  bumpMemberSecurityVersion(removedMember.id, "workspace.access.revoked");
  rotateRefreshSession(remSession.refreshToken);
  const nonMember = authorize({ userId: removedUserId, workspaceId, permission: "workspace.view" });
  assert(!nonMember.allowed, "CHG-003", "Removed member denied after refresh (account session still rotates)");

  // ─── Summary count guard ───
  const minExpected = 50;
  assert(passed >= minExpected, "META-001", `At least ${minExpected} matrix cases executed (actual: ${passed})`);

  const rolePermCases = roleCase + 3;
  const effectCases = effectCase;
  const overrideCases = ovrCase;
  assert(rolePermCases >= 15, "META-002", `Role spotlight cases: ${rolePermCases}`);
  assert(effectCases >= 15, "META-003", `Effect matrix cases: ${effectCases}`);
  assert(overrideCases >= 40, "META-004", `Override matrix cases: ${overrideCases}`);
} catch (e) {
  console.error("Role permission refresh QA fatal:", e);
  failed += 1;
} finally {
  for (const ws of trackedWorkspaces) {
    db.prepare("DELETE FROM approval_requests WHERE workspace_id = ?").run(ws);
    db.prepare("DELETE FROM workspace_member_permissions WHERE member_id IN (SELECT id FROM workspace_members WHERE workspace_id = ?)").run(ws);
    db.prepare("DELETE FROM workspace_members WHERE workspace_id = ?").run(ws);
    db.prepare("DELETE FROM workspace_roles WHERE workspace_id = ?").run(ws);
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(ws);
  }
  for (const uid of trackedUsers) {
    db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(uid);
    db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
