import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../api";
import { TasksPanel } from "../components/TasksPanel";
import { IssuesPanel } from "../components/IssuesPanel";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { WorkspacesPanel } from "../components/WorkspacesPanel";
import { NotificationCenter } from "../components/NotificationCenter";
import { TaskDetailView } from "../components/TaskDetailView";
import { IssueDetailView } from "../components/IssueDetailView";
import { SeveritySummary } from "../components/SeveritySummary";
import { SeverityBadge } from "../components/SeverityBadge";
import type { View, Workspace, Task, Notification, DetailTarget, NavigationTarget, SeverityFilter, Severity, SeverityStats } from "../types";

const NAV: { id: View; icon: string; label: string }[] = [
  { id: "dashboard", icon: "▦", label: "Dashboard" },
  { id: "tasks", icon: "☑", label: "Tasks" },
  { id: "issues", icon: "⚠", label: "Issues" },
  { id: "notifications", icon: "🔔", label: "Notifications" },
  { id: "workspaces", icon: "📁", label: "Workspaces" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function Dashboard() {
  const { user, token, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>("dashboard");
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | undefined>();
  const [stats, setStats] = useState({ tasks: 0, issues: 0, unread: 0, workspaces: 0 });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentNotifs, setRecentNotifs] = useState<Notification[]>([]);

  const [severityStats, setSeverityStats] = useState<SeverityStats | null>(null);
  const [taskSeverityFilter, setTaskSeverityFilter] = useState<SeverityFilter>("all");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<SeverityFilter>("all");

  const refreshStats = () => {
    if (!token) return;
    Promise.all([
      api.getTasks(token),
      api.getIssues(token),
      api.getNotifications(token),
      api.getWorkspaces(token),
      api.getSeverityStats(token, activeWorkspace?.id),
    ]).then(([t, i, n, w, s]) => {
      setStats({ tasks: t.tasks.length, issues: i.issues.length, unread: n.unreadCount, workspaces: w.workspaces.length });
      setRecentTasks(t.tasks.slice(0, 5));
      setRecentNotifs(n.notifications.slice(0, 5));
      setActiveWorkspace(w.active);
      setSeverityStats(s.stats);
    });
  };

  useEffect(refreshStats, [token, view, detail, activeWorkspace?.id]);

  const navigate = (target: NavigationTarget) => {
    setView(target.view);
    setDetail(target.detail ?? null);
    if (target.severityFilter) {
      if (target.view === "tasks") setTaskSeverityFilter(target.severityFilter);
      if (target.view === "issues") setIssueSeverityFilter(target.severityFilter);
    }
  };

  const openSeverityFilter = (entity: "tasks" | "issues", severity: Severity) => {
    if (entity === "tasks") setTaskSeverityFilter(severity);
    else setIssueSeverityFilter(severity);
    setView(entity);
    setDetail(null);
  };

  const renderContent = () => {
    if (detail?.kind === "task") {
      return <TaskDetailView taskId={detail.id} onClose={() => setDetail(null)} />;
    }
    if (detail?.kind === "issue") {
      return <IssueDetailView issueId={detail.id} onClose={() => setDetail(null)} />;
    }

    switch (view) {
      case "dashboard":
        return (
          <div className="dashboard-grid">
            <div className="stat-cards">
              <div className="stat-card"><span>Tasks</span><strong>{stats.tasks}</strong></div>
              <div className="stat-card"><span>Issues</span><strong>{stats.issues}</strong></div>
              <div className="stat-card"><span>Unread</span><strong>{stats.unread}</strong></div>
              <div className="stat-card"><span>Workspaces</span><strong>{stats.workspaces}</strong></div>
            </div>
            {severityStats && (
              <>
                <SeveritySummary
                  title="Tasks by severity"
                  counts={severityStats.tasks}
                  onSelect={(s) => openSeverityFilter("tasks", s)}
                />
                <SeveritySummary
                  title="Issues by severity"
                  counts={severityStats.issues}
                  onSelect={(s) => openSeverityFilter("issues", s)}
                />
                <SeveritySummary
                  title="Subtasks by severity"
                  counts={severityStats.subtasks}
                  onSelect={() => setView("tasks")}
                />
              </>
            )}
            <section className="card">
              <h3>Recent tasks</h3>
              {recentTasks.length === 0 ? <p className="empty">No tasks yet.</p> : (
                <ul>{recentTasks.map((t) => (
                  <li key={t.id} className="recent-item">
                    <button type="button" className="link-btn" onClick={() => setDetail({ kind: "task", id: t.id })}>
                      {t.status === "done" ? "✓" : "○"} {t.title}
                    </button>
                    <SeverityBadge severity={t.severity ?? "medium"} compact />
                  </li>
                ))}</ul>
              )}
            </section>
            <section className="card">
              <h3>Recent notifications</h3>
              {recentNotifs.length === 0 ? <p className="empty">No notifications.</p> : (
                <ul>{recentNotifs.map((n) => (
                  <li key={n.id} className={n.is_read ? "" : "unread"}>{n.title}</li>
                ))}</ul>
              )}
            </section>
          </div>
        );
      case "tasks":
        return (
          <TasksPanel
            workspaceId={activeWorkspace?.id}
            severityFilter={taskSeverityFilter}
            onSeverityFilterChange={setTaskSeverityFilter}
            onSelect={(id) => setDetail({ kind: "task", id })}
          />
        );
      case "issues":
        return (
          <IssuesPanel
            workspaceId={activeWorkspace?.id}
            severityFilter={issueSeverityFilter}
            onSeverityFilterChange={setIssueSeverityFilter}
            onSelect={(id) => setDetail({ kind: "issue", id })}
          />
        );
      case "notifications":
        return <NotificationsPanel onNavigate={navigate} />;
      case "workspaces":
        return <WorkspacesPanel onActiveChange={setActiveWorkspace} />;
      case "settings":
        return (
          <div className="panel">
            <header className="panel-header"><h2>Settings</h2></header>
            <div className="settings-body">
              <p><strong>Theme:</strong> {theme}</p>
              <button onClick={toggle}>Toggle {theme === "dark" ? "light" : "dark"} mode</button>
              <p className="muted">Signed in as {user?.email}</p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <nav className="activity-bar">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "active" : ""}
            title={item.label}
            onClick={() => { setView(item.id); setDetail(null); }}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="brand">JELLYFISH</span>
          <span className="user">{user?.username}</span>
        </div>
        {activeWorkspace && (
          <div className="active-ws">
            <span className="label">Active workspace</span>
            <strong>{activeWorkspace.name}</strong>
          </div>
        )}
        <ul className="nav-list">
          {NAV.map((item) => (
            <li key={item.id}>
              <button type="button" className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setDetail(null); }}>
                {item.icon} {item.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{NAV.find((n) => n.id === view)?.label}</h1>
          <div className="topbar-actions">
            <NotificationCenter workspaceId={activeWorkspace?.id} onNavigate={navigate} />
            <button type="button" className="btn-secondary" onClick={toggle}>
              {theme === "dark" ? "☀ Light" : "🌙 Dark"}
            </button>
            <button type="button" className="btn-secondary" onClick={logout}>Sign out</button>
          </div>
        </header>

        <div className="content">{renderContent()}</div>
      </main>
    </div>
  );
}
