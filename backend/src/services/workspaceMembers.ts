import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import type { User } from "../types.js";
import {
  addMember,
  findUserByEmail,
  getMembership,
  listMembers,
  changeMemberRole,
  removeMember,
  getMemberEffectivePermissions,
  requirePermission,
  ForbiddenError,
  requireWorkspaceOwner,
} from "./authorization.js";
import { getRole, listRolesWithPermissions } from "./workspaceRoles.js";
import { getPermissionsByRole } from "./permissions.js";
import {
  getMemberOverrideSets,
  setMemberPermissionOverrides,
  clearMemberPermissionOverrides,
  type MemberPermissionOverride,
} from "./memberPermissions.js";
import { getMemberEffectivePermissions as resolveMemberPermissions } from "./authorization.js";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "revoked" | "expired";

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_by: string;
  role_id: string;
  status: InvitationStatus;
  token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface InvitationWithDetails extends WorkspaceInvitation {
  role_name: string;
  invited_by_username: string;
  workspace_name?: string;
}

const INVITE_TTL_DAYS = 7;

export function listInvitations(workspaceId: string): InvitationWithDetails[] {
  return db.prepare(`
    SELECT i.*, r.name AS role_name, u.username AS invited_by_username
    FROM workspace_invitations i
    JOIN workspace_roles r ON r.id = i.role_id
    JOIN users u ON u.id = i.invited_by
    WHERE i.workspace_id = ?
    ORDER BY i.created_at DESC
  `).all(workspaceId) as InvitationWithDetails[];
}

export function createInvitation(
  actorUserId: string,
  workspaceId: string,
  email: string,
  roleId: string
): WorkspaceInvitation {
  requirePermission(actorUserId, workspaceId, "member.invite");

  const role = getRole(workspaceId, roleId);
  if (!role) throw new Error("Role not found");
  if (role.slug === "owner") throw new ForbiddenError("Cannot invite as Owner");

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = findUserByEmail(normalizedEmail);
  if (existingUser) {
    const membership = getMembership(existingUser.id, workspaceId);
    if (membership) throw new Error("User is already a workspace member");
  }

  const pending = db.prepare(`
    SELECT id FROM workspace_invitations
    WHERE workspace_id = ? AND email = ? AND status = 'pending'
  `).get(workspaceId, normalizedEmail);
  if (pending) throw new Error("A pending invitation already exists for this email");

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);

  db.prepare(`
    INSERT INTO workspace_invitations (id, workspace_id, email, invited_by, role_id, token, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, normalizedEmail, actorUserId, roleId, token, expires.toISOString());

  const invitation = db.prepare("SELECT * FROM workspace_invitations WHERE id = ?").get(id) as WorkspaceInvitation;

  const workspace = db.prepare("SELECT name FROM workspaces WHERE id = ?").get(workspaceId) as { name: string } | undefined;

  ActivityLogger.log({
    userId: actorUserId,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    action: "member_invited",
    description: `Invited ${normalizedEmail} to workspace`,
    metadata: { email: normalizedEmail, role_id: roleId, role_name: role.name },
  });

  if (existingUser) {
    notify({
      userId: existingUser.id,
      type: "invite",
      title: "Workspace invitation",
      message: `You were invited to join "${workspace?.name ?? "a workspace"}" as ${role.name}.`,
      workspaceId,
      entityType: "workspace",
      entityId: workspaceId,
      metadata: {
        action: "workspace_invite",
        invitation_token: token,
        invitation_id: id,
        role_name: role.name,
        workspace_name: workspace?.name ?? "",
      },
    });
  }

  return invitation;
}

export function resendInvitation(actorUserId: string, workspaceId: string, invitationId: string): WorkspaceInvitation {
  requirePermission(actorUserId, workspaceId, "member.invite");

  const invitation = db.prepare(`
    SELECT * FROM workspace_invitations WHERE id = ? AND workspace_id = ?
  `).get(invitationId, workspaceId) as WorkspaceInvitation | undefined;

  if (!invitation) throw new Error("Invitation not found");
  if (invitation.status !== "pending") throw new Error("Only pending invitations can be resent");

  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
  const token = crypto.randomUUID();

  db.prepare(`
    UPDATE workspace_invitations SET token = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?
  `).run(token, expires.toISOString(), invitationId);

  return db.prepare("SELECT * FROM workspace_invitations WHERE id = ?").get(invitationId) as WorkspaceInvitation;
}

export function revokeInvitation(actorUserId: string, workspaceId: string, invitationId: string): void {
  requirePermission(actorUserId, workspaceId, "member.invite");

  const invitation = db.prepare(`
    SELECT * FROM workspace_invitations WHERE id = ? AND workspace_id = ?
  `).get(invitationId, workspaceId) as WorkspaceInvitation | undefined;

  if (!invitation) throw new Error("Invitation not found");
  if (invitation.status !== "pending") throw new Error("Only pending invitations can be revoked");

  db.prepare(`
    UPDATE workspace_invitations SET status = 'revoked', updated_at = datetime('now') WHERE id = ?
  `).run(invitationId);

  ActivityLogger.log({
    userId: actorUserId,
    workspaceId,
    entityType: "workspace",
    entityId: workspaceId,
    action: "invitation_revoked",
    description: `Revoked invitation for ${invitation.email}`,
    metadata: { email: invitation.email },
  });
}

export function acceptInvitation(userId: string, token: string): { workspaceId: string } {
  const invitation = db.prepare(`
    SELECT * FROM workspace_invitations WHERE token = ? AND status = 'pending'
  `).get(token) as WorkspaceInvitation | undefined;

  if (!invitation) throw new Error("Invalid or expired invitation");
  if (new Date(invitation.expires_at) < new Date()) {
    db.prepare("UPDATE workspace_invitations SET status = 'expired' WHERE id = ?").run(invitation.id);
    throw new Error("Invitation has expired");
  }

  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string };
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ForbiddenError("Invitation email does not match your account");
  }

  addMember(invitation.workspace_id, userId, invitation.role_id);
  db.prepare(`
    UPDATE workspace_invitations SET status = 'accepted', updated_at = datetime('now') WHERE id = ?
  `).run(invitation.id);

  ActivityLogger.log({
    userId,
    workspaceId: invitation.workspace_id,
    entityType: "workspace",
    entityId: invitation.workspace_id,
    action: "member_joined",
    description: "User joined workspace via invitation",
    metadata: { email: invitation.email },
  });

  notify({
    userId: invitation.invited_by,
    type: "workspace",
    title: "Invitation accepted",
    message: `${invitation.email} joined the workspace.`,
    workspaceId: invitation.workspace_id,
    entityType: "workspace",
    entityId: invitation.workspace_id,
  });

  return { workspaceId: invitation.workspace_id };
}

export function rejectInvitation(userId: string, token: string): void {
  const invitation = db.prepare(`
    SELECT * FROM workspace_invitations WHERE token = ? AND status = 'pending'
  `).get(token) as WorkspaceInvitation | undefined;

  if (!invitation) throw new Error("Invalid invitation");

  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string };
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new ForbiddenError("Invitation email does not match your account");
  }

  db.prepare(`
    UPDATE workspace_invitations SET status = 'rejected', updated_at = datetime('now') WHERE id = ?
  `).run(invitation.id);

  notify({
    userId: invitation.invited_by,
    type: "workspace",
    title: "Invitation declined",
    message: `${invitation.email} declined the workspace invitation.`,
    workspaceId: invitation.workspace_id,
    entityType: "workspace",
    entityId: invitation.workspace_id,
  });
}

export function listMyPendingInvitations(userId: string): InvitationWithDetails[] {
  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
  if (!user) return [];

  return db.prepare(`
    SELECT i.*, r.name AS role_name, u.username AS invited_by_username, w.name AS workspace_name
    FROM workspace_invitations i
    JOIN workspace_roles r ON r.id = i.role_id
    JOIN users u ON u.id = i.invited_by
    JOIN workspaces w ON w.id = i.workspace_id
    WHERE LOWER(i.email) = LOWER(?) AND i.status = 'pending' AND datetime(i.expires_at) > datetime('now')
    ORDER BY i.created_at DESC
  `).all(user.email) as InvitationWithDetails[];
}

export {
  listMembers,
  changeMemberRole,
  removeMember,
  getMemberEffectivePermissions,
  getMembership,
};

export function getMemberWithPermissions(workspaceId: string, memberId: string) {
  const member = listMembers(workspaceId).find((m) => m.id === memberId);
  if (!member) throw new Error("Member not found");
  const rolePermissions = getPermissionsByRole(member.role_id);
  const overrides = getMemberOverrideSets(memberId);
  const effectivePermissions = resolveMemberPermissions(workspaceId, memberId);
  return {
    ...member,
    role_permissions: rolePermissions,
    permission_overrides: overrides,
    effective_permissions: effectivePermissions,
  };
}

export function updateMemberPermissions(
  actorUserId: string,
  workspaceId: string,
  memberId: string,
  overrides: MemberPermissionOverride[]
) {
  requirePermission(actorUserId, workspaceId, "member.view");
  requireWorkspaceOwner(actorUserId, workspaceId);
  setMemberPermissionOverrides(workspaceId, memberId, overrides);
  return getMemberWithPermissions(workspaceId, memberId);
}

export function resetMemberPermissions(actorUserId: string, workspaceId: string, memberId: string) {
  requirePermission(actorUserId, workspaceId, "member.view");
  requireWorkspaceOwner(actorUserId, workspaceId);
  clearMemberPermissionOverrides(memberId);
  return getMemberWithPermissions(workspaceId, memberId);
}

export function getWorkspacePermissionMatrix(workspaceId: string) {
  return listRolesWithPermissions(workspaceId);
}
