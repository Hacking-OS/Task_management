import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { MediaPreviewProvider } from "../context/MediaPreviewContext";
import { WorkspaceProvider } from "../context/WorkspaceContext";
import { NotificationProvider } from "../context/NotificationContext";
import { MembersProvider } from "../context/MembersContext";
import { StatusProvider } from "../context/StatusContext";
import { PermissionsProvider } from "../context/PermissionsContext";
import { RequirePermission } from "../shared/PermissionGate";
import { AppLayout } from "../layouts/AppLayout";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { WorkspacesPage } from "../pages/workspaces/WorkspacesPage";
import { WorkspaceDetailPage } from "../pages/workspaces/WorkspaceDetailPage";
import { WorkspacePermissionsPage } from "../pages/workspaces/WorkspacePermissionsPage";
import { TasksPage } from "../pages/tasks/TasksPage";
import { TaskDetailPage } from "../pages/tasks/TaskDetailPage";
import { TaskCreatePage } from "../pages/tasks/TaskCreatePage";
import { TaskEditPage } from "../pages/tasks/TaskEditPage";
import { IssuesPage } from "../pages/issues/IssuesPage";
import { IssueDetailPage } from "../pages/issues/IssueDetailPage";
import { IssueCreatePage } from "../pages/issues/IssueCreatePage";
import { SubtasksPage } from "../pages/subtasks/SubtasksPage";
import { AssignmentsPage } from "../pages/assignments/AssignmentsPage";
import { NotificationsPage } from "../pages/notifications/NotificationsPage";
import { ActivityPage } from "../pages/activity/ActivityPage";
import { FilesPage } from "../pages/files/FilesPage";
import { TimesheetsPage } from "../pages/timesheets/TimesheetsPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { AppLoadingSkeleton } from "../shared/Skeleton";
import { ToastViewport } from "../shared/ToastViewport";

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <WorkspaceProvider>
      <NotificationProvider>
      <MembersProvider>
        <PermissionsProvider>
          <StatusProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<RequirePermission permission="workspace.view" allowWithoutWorkspace><DashboardPage /></RequirePermission>} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="workspaces/:workspaceId" element={<RequirePermission permission="workspace.view" allowWithoutWorkspace><WorkspaceDetailPage /></RequirePermission>} />
              <Route path="workspaces/:workspaceId/permissions" element={<RequirePermission permission="member.view"><WorkspacePermissionsPage /></RequirePermission>} />
              <Route path="tasks" element={<RequirePermission permission="task.view"><TasksPage /></RequirePermission>} />
              <Route path="tasks/create" element={<RequirePermission permission="task.create"><TaskCreatePage /></RequirePermission>} />
              <Route path="tasks/:taskId" element={<RequirePermission permission="task.view"><TaskDetailPage /></RequirePermission>} />
              <Route path="tasks/:taskId/edit" element={<RequirePermission permission="task.edit"><TaskEditPage /></RequirePermission>} />
              <Route path="issues" element={<RequirePermission permission="issue.view"><IssuesPage /></RequirePermission>} />
              <Route path="issues/create" element={<RequirePermission permission="issue.create"><IssueCreatePage /></RequirePermission>} />
              <Route path="issues/:issueId" element={<RequirePermission permission="issue.view"><IssueDetailPage /></RequirePermission>} />
              <Route path="subtasks" element={<RequirePermission permission="subtask.view"><SubtasksPage /></RequirePermission>} />
              <Route path="assignments" element={<RequirePermission anyOf={["task.view", "issue.view", "subtask.view"]}><AssignmentsPage /></RequirePermission>} />
              <Route path="notifications" element={<RequirePermission permission="notification.view"><NotificationsPage /></RequirePermission>} />
              <Route path="activity" element={<RequirePermission permission="activity.view"><ActivityPage /></RequirePermission>} />
              <Route path="files" element={<RequirePermission permission="file.view"><FilesPage /></RequirePermission>} />
              <Route path="timesheets" element={<RequirePermission permission="timesheet.view"><TimesheetsPage /></RequirePermission>} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          </StatusProvider>
        </PermissionsProvider>
      </MembersProvider>
      </NotificationProvider>
    </WorkspaceProvider>
  );
}

export function AppRouter() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingSkeleton />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

export function AppRoot() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <MediaPreviewProvider>
            <AppRouter />
            <ToastViewport />
          </MediaPreviewProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
