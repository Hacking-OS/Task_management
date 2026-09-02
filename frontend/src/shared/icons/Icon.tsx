import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "dashboard"
  | "tasks"
  | "issues"
  | "subtasks"
  | "assignments"
  | "notifications"
  | "activity"
  | "files"
  | "workspaces"
  | "settings"
  | "search"
  | "plus"
  | "folder"
  | "file"
  | "chevron-right"
  | "user"
  | "logout";

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  tasks: (
    <>
      <path d="M9 11l2 2 4-4" />
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </>
  ),
  issues: (
    <>
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
      <path d="M10.29 3.86 2.82 17a1 1 0 0 0 .86 1.5h16.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" />
    </>
  ),
  subtasks: (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </>
  ),
  assignments: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 11h5" />
      <path d="M18.5 8.5v5" />
    </>
  ),
  notifications: (
    <>
      <path d="M15 17H9" />
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  files: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  workspaces: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  "chevron-right": (
    <path d="m9 6 6 6-6 6" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
      <path d="M14 12h8" />
      <path d="m18 9 3 3-3 3" />
    </>
  ),
};

export function Icon({ name, size = 18, className, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Map notification types to icon names for consistent UI. */
export function notificationIconName(type: string): IconName {
  switch (type) {
    case "task": return "tasks";
    case "issue": return "issues";
    case "subtask": return "subtasks";
    case "assignment": return "assignments";
    case "invite": return "workspaces";
    case "workspace": return "workspaces";
    case "comment": return "files";
    case "file": return "file";
    case "success": return "tasks";
    case "warning": return "issues";
    default: return "notifications";
  }
}
