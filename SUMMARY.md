# PY-BOT / Jellyfish Workspace — Project Summary

## What it is

**Jellyfish Workspace** is a self-hosted team productivity app. Users sign in, join workspaces, and manage software delivery work: tasks, bugs/issues, subtasks, file attachments, time logging, and team permissions — all scoped to a logical workspace rather than a folder on disk.

---

## Architecture at a glance

```
Browser (React SPA)
       │  REST + JWT
       ▼
Express API (TypeScript)
       │
       ├── SQLite (users, workspaces, tasks, issues, RBAC, activity, …)
       └── File system (data/uploads/{workspaceId}/…)
```

The frontend proxies `/api` to the backend during development (Vite port 5173 → backend 4000).

---

## Core modules

| Module | Purpose |
|--------|---------|
| **Auth** | Register, login, JWT sessions, avatar upload |
| **Workspaces** | Create/activate/delete logical workspaces; demo seed for Acme Software |
| **Tasks / Issues / Subtasks** | CRUD, severity, status, assignees, watchers |
| **RBAC** | Roles, permissions matrix, members, teams, invitations |
| **Notifications** | In-app alerts for lifecycle events (assign, create, update, delete, comment, file) |
| **Activity log** | Auditable history on workspace and entity actions |
| **Files** | Categorized uploads (task, issue, subtask, comment, general) |
| **Timesheets** | Hours logged per work item |
| **Dashboard** | Aggregated stats and Recharts visualizations |

---

## Recent improvements (session summary)

### 1. Logical workspaces (no directory required)
- Removed **root path** from workspace creation UI and API
- Dropped `root_path` column from the database
- Uploads use internal storage: `backend/data/uploads/{workspaceId}`
- Migration backfills orphaned records into the **Acme Software** workspace

### 2. Notifications & activity
- Backend emits notifications and activity logs for task/issue/subtask assign/create/update/delete, comments, and file upload/delete
- Frontend activity labels and notification deep-links updated

### 3. UX polish
- Global **toast** system for create/update/delete/patch/error feedback
- Form validation on workspace, task, issue, subtask, and timesheet forms

### 4. Bug fixes
- Fixed **“Workspace ID is required”** on list pages by waiting for active workspace before API calls
- Fixed permissions/members endpoints and workspace auth edge cases
- Repaired workspace data so dashboard and list views show populated demo content

### 5. Documentation & screenshots
- 15 Playwright screenshots with live **Acme Software** demo data in `screenshots/`
- This README and summary

---

## Demo data (Acme Software)

On first run, if **Acme Software** does not exist, the backend seeds:

| Item | Count (approx.) |
|------|-----------------|
| Users | 15 (roles from Owner to Support) |
| Teams | 5 (Platform, Product, QA, DevOps, Support) |
| Tasks | 8+ demo tasks |
| Issues | 5+ demo issues |
| Subtasks | 10 linked subtasks |
| Timesheets | Sample entries after migration backfill |

Login as **`demo` / `demo1234`** to explore with full Owner permissions.

---

## Tech decisions

| Decision | Rationale |
|----------|-----------|
| SQLite | Zero-config local dev; single-file DB in `data/app.db` |
| Workspace-scoped RBAC | Multi-tenant style isolation without separate databases |
| Internal upload dirs | Workspaces are product entities, not OS folder bindings |
| JWT | Stateless API auth suitable for SPA + optional Socket.IO |

---

## How to run (cheat sheet)

```powershell
npm run install:all   # once
npm run dev           # backend :4000 + frontend :5173
```

Open http://localhost:5173 → sign in with `demo` / `demo1234`.

---

## Folder reference

| Path | Contents |
|------|----------|
| `README.md` | Setup, features, API index |
| `SUMMARY.md` | This document — overview & changelog-style summary |
| `screenshots/` | UI captures + `README.md` index |
| `scripts/capture-screenshots.mjs` | Automated screenshot bot |
| `backend/data/app.db` | Live database |
| `backend/data/uploads/` | Workspace file storage |

---

## Possible next steps

- Email/push notifications beyond in-app
- Workspace settings edit (name/description) in UI
- Export/reporting (CSV/PDF)
- E2E test suite using the existing Playwright script as a base
- Production deployment guide (PostgreSQL, S3 uploads, env secrets)
