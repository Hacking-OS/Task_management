import type { Notification, NavigationTarget } from "../types";

export function navigationFromNotification(n: Notification): NavigationTarget | null {
  if (!n.entity_type || !n.entity_id) {
    if (n.type === "workspace" && n.workspace_id) {
      return { view: "workspaces", detail: { kind: "workspace", id: n.workspace_id } };
    }
    return { view: "notifications" };
  }

  switch (n.entity_type) {
    case "task":
      return { view: "tasks", detail: { kind: "task", id: n.entity_id } };
    case "issue":
      return { view: "issues", detail: { kind: "issue", id: n.entity_id } };
    case "subtask":
      return { view: "tasks" };
    case "assignment":
      return { view: "tasks" };
    case "workspace":
      return { view: "workspaces", detail: { kind: "workspace", id: n.entity_id } };
    case "comment":
    case "file":
      return n.workspace_id
        ? { view: "workspaces", detail: { kind: "workspace", id: n.workspace_id } }
        : { view: "workspaces" };
    default:
      return { view: "notifications" };
  }
}
