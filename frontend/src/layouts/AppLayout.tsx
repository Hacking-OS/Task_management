import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { NotificationBell } from "../shared/NotificationBell";
import { PermissionGate } from "../shared/PermissionGate";
import { UserAvatar } from "../shared/UserAvatar";
import { Icon, type IconName } from "../shared/icons/Icon";

type NavItem = { to: string; label: string; icon: IconName; permission?: string; anyOf?: string[] };

function filterNavItems(items: NavItem[], hasPermission: (c: string) => boolean, hasAny: (c: string[]) => boolean) {
  return items.filter((item) => {
    if (item.permission) return hasPermission(item.permission);
    if (item.anyOf) return hasAny(item.anyOf);
    return true;
  });
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const railNav = filterNavItems(
    [
      { to: "/dashboard", icon: "home", label: "Home", permission: "workspace.view" },
      { to: "/tasks", icon: "tasks", label: "Tasks", permission: "task.view" },
      { to: "/issues", icon: "issues", label: "Issues", permission: "issue.view" },
      { to: "/notifications", icon: "notifications", label: "Alerts", permission: "notification.view" },
    ],
    hasPermission,
    hasAnyPermission
  );

  const navGroups: { section: string; items: NavItem[] }[] = [
    {
      section: "Overview",
      items: filterNavItems([{ to: "/dashboard", label: "Dashboard", icon: "dashboard", permission: "workspace.view" }], hasPermission, hasAnyPermission),
    },
    {
      section: "Workspace",
      items: filterNavItems(
        [
          { to: "/files", label: "Files", icon: "files", permission: "file.view" },
          { to: "/timesheets", label: "Timesheets", icon: "tasks", permission: "timesheet.view" },
          { to: "/workspaces", label: "Overview", icon: "workspaces" },
          ...(activeWorkspace
            ? [{ to: `/workspaces/${activeWorkspace.id}/permissions`, label: "Permissions", icon: "settings" as IconName, permission: "member.view" }]
            : []),
        ],
        hasPermission,
        hasAnyPermission
      ),
    },
    {
      section: "Work Management",
      items: filterNavItems(
        [
          { to: "/tasks", label: "Tasks", icon: "tasks", permission: "task.view" },
          { to: "/issues", label: "Issues", icon: "issues", permission: "issue.view" },
          { to: "/subtasks", label: "Subtasks", icon: "subtasks", permission: "subtask.view" },
          { to: "/assignments", label: "Assignments", icon: "assignments", anyOf: ["task.view", "issue.view", "subtask.view"] },
        ],
        hasPermission,
        hasAnyPermission
      ),
    },
    {
      section: "Activity",
      items: filterNavItems(
        [
          { to: "/notifications", label: "Notifications", icon: "notifications", permission: "notification.view" },
          { to: "/activity", label: "Activity", icon: "activity", permission: "activity.view" },
        ],
        hasPermission,
        hasAnyPermission
      ),
    },
    { section: "System", items: [{ to: "/settings", label: "Settings", icon: "settings" as IconName }] },
  ].filter((g) => g.items.length > 0);

  const pageTitle = (() => {
    const p = location.pathname;
    if (p.includes("/permissions")) return "Permissions";
    if (p.startsWith("/tasks")) return "Tasks";
    if (p.startsWith("/issues")) return "Issues";
    if (p.startsWith("/subtasks")) return "Subtasks";
    if (p.startsWith("/notifications")) return "Notifications";
    if (p.startsWith("/activity")) return "Activity";
    if (p.startsWith("/files")) return "Files";
    if (p.startsWith("/timesheets")) return "Timesheets";
    if (p.startsWith("/workspaces")) return "Workspaces";
    if (p.startsWith("/settings")) return "Settings";
    return "Dashboard";
  })();

  return (
    <div className="app-layout">
      <aside className="icon-rail" aria-label="Quick navigation">
        <div className="rail-logo">
          <Icon name="workspaces" size={20} className="rail-logo-icon" />
        </div>
        {railNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `rail-link${isActive ? " active" : ""}`}
            title={item.label}
          >
            <Icon name={item.icon} size={20} />
          </NavLink>
        ))}
      </aside>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">
            <Icon name="workspaces" size={18} />
          </span>
          <div>
            <strong>Jellyfish</strong>
            <span>Workspace</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navGroups.map((group) => (
            <div key={group.section} className="nav-group">
              <span className="nav-group-label">{group.section}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <Icon name={item.icon} size={17} className="nav-link-icon" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main-column">
        <header className="top-header">
          <div className="header-left">
            <h2 className="page-title-sm">{pageTitle}</h2>
            <button type="button" className="workspace-chip" onClick={() => navigate("/workspaces")}>
              <Icon name="workspaces" size={14} />
              {activeWorkspace?.name ?? "Select workspace"}
            </button>
          </div>
          <div className="header-right">
            <div className="search-wrap">
              <Icon name="search" size={16} className="search-icon" />
              <input className="header-search" placeholder="Search tasks, issues, files…" />
            </div>
            <NotificationBell />
            <div className="avatar-stack" title={user?.username} onClick={() => navigate("/settings")} role="button">
              <UserAvatar user={user ?? undefined} size="sm" previewable />
            </div>
            <PermissionGate permission="task.create">
              <button type="button" className="btn btn-primary btn-sm btn-icon" onClick={() => navigate("/tasks/create")}>
                <Icon name="plus" size={16} />
                Add Task
              </button>
            </PermissionGate>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={logout} title="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>

        {!activeWorkspace && (
          <div className="workspace-banner">Select or create a workspace to continue.</div>
        )}

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
