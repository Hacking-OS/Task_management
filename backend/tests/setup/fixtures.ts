import { register } from "../../src/services/auth.js";
import { createWorkspace } from "../../src/services/workspaces.js";
import { addMember, getMembership } from "../../src/services/authorization.js";
import { getRoleBySlug } from "../../src/services/workspaceRoles.js";
import { setMemberPermissionOverrides } from "../../src/services/memberPermissions.js";
import { getRolePermissionEntries, setRolePermissionEffects } from "../../src/services/permissions.js";
import type { User } from "../../src/types.js";

export interface TestUser extends User {
  password: string;
  accessToken: string;
}

export interface WorkspaceFixture {
  id: string;
  owner: TestUser;
}

let userCounter = 0;

export function uniqueId(prefix: string): string {
  userCounter += 1;
  const base = `${prefix}${userCounter}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return base.length >= 3 ? base : `u${userCounter}`;
}

export function createTestUser(prefix = "user"): TestUser {
  const id = uniqueId(prefix);
  const result = register(id, `${id}@t.local`, "TestPass1", undefined, {
    requestId: "jest-fixture",
  });
  return { ...result.user, password: "TestPass1", accessToken: result.accessToken };
}

export function createWorkspaceFixture(prefix = "ws"): WorkspaceFixture {
  const owner = createTestUser(`${prefix}_owner`);
  const workspace = createWorkspace(owner.id, `${prefix} Workspace`, "Jest fixture");
  return { id: workspace.id, owner };
}

export function addWorkspaceMember(
  workspaceId: string,
  roleSlug: "admin" | "developer" | "viewer" | "tech-lead" | "qa-engineer",
  user?: TestUser,
): TestUser {
  const member = user ?? createTestUser(roleSlug);
  const role = getRoleBySlug(workspaceId, roleSlug);
  if (!role) throw new Error(`Role ${roleSlug} not found`);
  addMember(workspaceId, member.id, role.id);
  return member;
}

export function grantMemberOverride(
  workspaceId: string,
  memberUserId: string,
  grants: string[] = [],
  denies: string[] = [],
): void {
  const m = getMembership(memberUserId, workspaceId);
  if (!m) throw new Error("Member not found");
  setMemberPermissionOverrides(workspaceId, m.id, [
    ...grants.map((permission_code) => ({ permission_code, effect: "grant" as const })),
    ...denies.map((permission_code) => ({ permission_code, effect: "deny" as const })),
  ]);
}

export function setRoleEffect(
  workspaceId: string,
  roleSlug: string,
  permissionCode: string,
  effect: "allow" | "approval_required" | "deny",
): void {
  const role = getRoleBySlug(workspaceId, roleSlug);
  if (!role) throw new Error(`Role ${roleSlug} not found`);
  const existing = getRolePermissionEntries(role.id);
  const map = new Map(existing.map((e) => [e.permission_code, e.effect]));
  map.set(permissionCode, effect);
  setRolePermissionEffects(
    role.id,
    Array.from(map.entries()).map(([permission_code, eff]) => ({ permission_code, effect: eff })),
  );
}
