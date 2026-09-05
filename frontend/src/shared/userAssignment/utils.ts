import type { AssignableEntityType } from "./types";
import { ASSIGN_PERMISSION } from "./types";

export function assigneeIdsFrom(entity: { assignee_id?: string | null; assignee_ids?: string[] }): string[] {
  if (entity.assignee_ids?.length) return entity.assignee_ids;
  return entity.assignee_id ? [entity.assignee_id] : [];
}

export function assignPermissionFor(entityType: AssignableEntityType): string {
  return ASSIGN_PERMISSION[entityType];
}

export function memberMatchesSearch(
  member: { username: string; email: string; role_name: string },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    member.username.toLowerCase().includes(q) ||
    member.email.toLowerCase().includes(q) ||
    member.role_name.toLowerCase().includes(q)
  );
}

export function sortMembersForPicker<T extends { user_id: string; username: string }>(
  members: T[],
  selectedIds: string[]
): T[] {
  return [...members].sort((a, b) => {
    const aSel = selectedIds.includes(a.user_id);
    const bSel = selectedIds.includes(b.user_id);
    if (aSel !== bSel) return aSel ? -1 : 1;
    return a.username.localeCompare(b.username);
  });
}
