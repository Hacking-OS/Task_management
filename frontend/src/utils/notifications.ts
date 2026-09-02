import type { NotificationType } from "../types";

export function notificationIcon(type: NotificationType | string): string {
  switch (type) {
    case "login": return "🔑";
    case "task": return "☑";
    case "issue": return "⚠";
    case "subtask": return "▸";
    case "assignment": return "👤";
    case "workspace": return "📁";
    case "comment": return "💬";
    case "file": return "📎";
    case "success": return "✨";
    case "warning": return "⏰";
    case "mention": return "@";
    default: return "🔔";
  }
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleString();
}
