export function approvalDecideCode(permissionCode: string): string {
  return `approval.decide.${permissionCode}`;
}

export function isApprovalDecideCode(code: string): boolean {
  return code === "approval.decide" || code.startsWith("approval.decide.");
}
