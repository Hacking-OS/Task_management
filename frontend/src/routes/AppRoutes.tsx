import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { WorkspaceProvider, useWorkspace } from "../context/WorkspaceContext";
import { NotificationProvider } from "../context/NotificationContext";
import { SocketProvider } from "../context/SocketContext";
import { MembersProvider } from "../context/MembersContext";
import { StatusProvider } from "../context/StatusContext";
import { PermissionsProvider } from "../context/PermissionsContext";
import { ApprovalsProvider } from "../context/ApprovalsContext";
import { RequirePermission } from "../shared/PermissionGate";
import { WorkspaceRouteGuard } from "../shared/WorkspaceRouteGuard";
import { AuthEntryRedirect } from "../shared/AuthEntryRedirect";
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
import { BillingPage } from "../pages/billing/BillingPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { TeamsPage } from "../pages/teams/TeamsPage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { SecurityCenterPage } from "../pages/security/SecurityCenterPage";
import { WorkspaceOnboardingPage } from "../pages/onboarding/WorkspaceOnboardingPage";
import { InviteLandingPage } from "../pages/onboarding/InviteLandingPage";
import { AppLoadingSkeleton } from "../shared/Skeleton";
import { saveReturnUrl } from "../utils/authRedirect";

function ProtectedRoutes() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  if (authLoading) return <AppLoadingSkeleton />;

  if (!user) {
    saveReturnUrl(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  return (
    <WorkspaceProvider>
      <ProtectedAppRoutes />
    </WorkspaceProvider>
  );
}

function ProtectedAppRoutes() {
  const { loading: wsLoading, ready: wsReady, switching } = useWorkspace();

  if (!wsReady || wsLoading || switching) {
    return <AppLoadingSkeleton />;
  }

  return (
    <SocketProvider>
      <NotificationProvider>
        <MembersProvider>
          <PermissionsProvider>
            <ApprovalsProvider>
              <StatusProvider>
                <Routes>
                  <Route path="onboarding" element={<WorkspaceOnboardingPage />} />
                  <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<RequirePermission permission="workspace.view" allowWithoutWorkspace><DashboardPage /></RequirePermission>} />
                    <Route path="workspaces" element={<WorkspacesPage />} />
                    <Route path="workspaces/:workspaceId" element={<WorkspaceRouteGuard><RequirePermission permission="workspace.view" allowWithoutWorkspace><WorkspaceDetailPage /></RequirePermission></WorkspaceRouteGuard>} />
                    <Route path="workspaces/:workspaceId/permissions" element={<WorkspaceRouteGuard><RequirePermission permission="member.view"><WorkspacePermissionsPage /></RequirePermission></WorkspaceRouteGuard>} />
                    <Route path="tasks" element={<RequirePermission permission="task.view"><TasksPage /></RequirePermission>} />
                    <Route path="tasks/create" element={<RequirePermission permission="task.create"><TaskCreatePage /></RequirePermission>} />
                    <Route path="tasks/:taskId" element={<RequirePermission permission="task.view"><TaskDetailPage /></RequirePermission>} />
                    <Route path="tasks/:taskId/edit" element={<RequirePermission permission="task.edit"><TaskEditPage /></RequirePermission>} />
                    <Route path="issues" element={<RequirePermission permission="issue.view"><IssuesPage /></RequirePermission>} />
                    <Route path="issues/create" element={<RequirePermission permission="issue.create"><IssueCreatePage /></RequirePermission>} />
                    <Route path="issues/:issueId" element={<RequirePermission permission="issue.view"><IssueDetailPage /></RequirePermission>} />
                    <Route path="subtasks" element={<RequirePermission permission="subtask.view"><SubtasksPage /></RequirePermission>} />
                    <Route path="assignments" element={<RequirePermission anyOf={["task.view", "issue.view", "subtask.view"]}><AssignmentsPage /></RequirePermission>} />
                    <Route path="teams" element={<RequirePermission permission="team.view"><TeamsPage /></RequirePermission>} />
                    <Route path="teams/:teamId" element={<RequirePermission permission="team.view"><TeamsPage /></RequirePermission>} />
                    <Route path="projects" element={<RequirePermission permission="project.view"><ProjectsPage /></RequirePermission>} />
                    <Route path="projects/:projectId" element={<RequirePermission permission="project.view"><ProjectsPage /></RequirePermission>} />
                    <Route path="notifications" element={<RequirePermission permission="notification.view"><NotificationsPage /></RequirePermission>} />
                    <Route path="activity" element={<RequirePermission permission="activity.view"><ActivityPage /></RequirePermission>} />
                    <Route path="files" element={<RequirePermission permission="file.view"><FilesPage /></RequirePermission>} />
                    <Route path="timesheets" element={<RequirePermission permission="timesheet.view"><TimesheetsPage /></RequirePermission>} />
                    <Route path="billing" element={<BillingPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="security" element={<SecurityCenterPage />} />
                  </Route>
                </Routes>
              </StatusProvider>
            </ApprovalsProvider>
          </PermissionsProvider>
        </MembersProvider>
      </NotificationProvider>
    </SocketProvider>
  );
}

export function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingSkeleton />;

  return (
    <Routes>
      <Route path="/login" element={user ? <AuthEntryRedirect /> : <LoginPage />} />
      <Route path="/invite/:token" element={<InviteLandingPage />} />
      <Route path="/join/:code" element={<InviteLandingPage />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}
