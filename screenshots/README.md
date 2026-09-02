# PY-BOT Project Screenshots

Captured with Playwright using the demo account (`demo` / `demo1234`) against the **Acme Software** workspace with live data.

| File | Page |
|------|------|
| 01-login.png | Sign-in screen |
| 02-dashboard.png | Dashboard with task/issue stats |
| 03-workspaces.png | Workspaces list |
| 04-workspace-detail.png | Acme Software workspace detail |
| 05-workspace-permissions.png | Roles & permissions |
| 06-tasks.png | Tasks list with assignees |
| 07-task-detail.png | Task detail view |
| 08-issues.png | Issues list |
| 09-subtasks.png | Subtasks list |
| 10-assignments.png | Assignments |
| 11-notifications.png | Notifications |
| 12-activity.png | Activity log |
| 13-files.png | Files |
| 14-timesheets.png | Timesheets |
| 15-settings.png | Settings |

To recapture (frontend + backend must be running):

```bash
npm run build --prefix backend
node scripts/capture-screenshots.mjs
```
