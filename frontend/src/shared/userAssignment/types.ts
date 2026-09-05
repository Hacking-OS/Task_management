export type AssignableEntityType = "task" | "issue" | "subtask";

export const ASSIGN_PERMISSION: Record<AssignableEntityType, string> = {
  task: "task.assign",
  issue: "issue.assign",
  subtask: "subtask.assign",
};

export type AssignUsersVariant = "form" | "inline" | "filter" | "display";
