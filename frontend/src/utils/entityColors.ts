import type { StatusEntityType } from "../models/types";

export type WorkEntityType = StatusEntityType;

export const ENTITY_TYPE_COLORS: Record<WorkEntityType, { bg: string; text: string; border: string; solid: string }> = {
  task: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", solid: "#2563eb" },
  issue: { bg: "#fffbeb", text: "#b45309", border: "#fde68a", solid: "#d97706" },
  subtask: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe", solid: "#7c3aed" },
};

export const ENTITY_TYPE_LABELS: Record<WorkEntityType, string> = {
  task: "Task",
  issue: "Issue",
  subtask: "Subtask",
};

export function entityTypeColors(type: WorkEntityType) {
  return ENTITY_TYPE_COLORS[type];
}
