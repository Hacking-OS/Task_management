import { approvalDecideCode } from "./approvalCodes";

export interface PermissionCheckContext {
  permissions: string[];
  isOwner: boolean;
  approvalDecidePermissions?: string[];
}

export function can(ctx: PermissionCheckContext, permission: string): boolean {
  if (ctx.isOwner) return true;
  return ctx.permissions.includes(permission);
}

export function canRequest(_ctx: PermissionCheckContext, _permission: string): boolean {
  return true;
}

export function canApprove(ctx: PermissionCheckContext, permission: string): boolean {
  if (ctx.isOwner) return true;
  if (ctx.permissions.includes("approval.decide")) return true;
  const category = permission.split(".")[0];
  if (category && ctx.permissions.includes(`approval.decide.${category}`)) return true;
  if (ctx.approvalDecidePermissions?.includes(approvalDecideCode(permission))) return true;
  if (ctx.permissions.includes(approvalDecideCode(permission))) return true;
  return false;
}

export function approvalDecideCodeFor(permission: string): string {
  return approvalDecideCode(permission);
}

export function permissionLabel(
  code: string,
  catalog?: { code: string; name: string }[]
): string {
  return catalog?.find((p) => p.code === code)?.name ?? code;
}
