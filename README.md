# Jellyfish Workspace (TMS)

A full-stack team workspace app for managing **tasks**, **issues**, **subtasks**, **files**, **timesheets**, **notifications**, and **activity** — with role-based access control per workspace.

> **Disclaimer — overview only.** This README is provided for informational and overview purposes only. The software is supplied **as is**, with **no warranty or guarantee** of any kind, express or implied, including but not limited to fitness for a particular purpose, accuracy, availability, or uninterrupted operation. Use at your own risk.

| Layer | Stack |
|-------|--------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Express, TypeScript, SQLite (`better-sqlite3`) |
| Realtime | Socket.IO |
| Auth | JWT + bcrypt |

---

## Quick start

```powershell
# From project root
npm run install:all
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000/api |
| Health check | http://localhost:4000/api/health |

Build for production:

```powershell
npm run build
npm run start --prefix backend
npm run preview --prefix frontend
```

---

## Demo account

| Field | Value |
|-------|--------|
| Username | `demo` |
| Password | `demo1234` |
| Demo workspace | **Acme Software** (pre-seeded with users, teams, tasks, issues, subtasks) |

Additional demo users (same password): `alex.admin`, `dev.alice`, `qa.priya`, `pm.sarah`, and others — see `backend/src/services/demoSeed.ts`.

---

## Project structure

```
PY-BOT/
├── backend/                 Express API + SQLite
│   ├── src/
│   │   ├── routes/          REST endpoints
│   │   ├── services/        Business logic
│   │   ├── middleware/      Auth & workspace permissions
│   │   └── db.ts            Database init & migrations
│   └── data/
│       ├── app.db           SQLite database (auto-created)
│       └── uploads/         Per-workspace file storage
├── frontend/                React SPA
│   └── src/
│       ├── pages/             App screens
│       ├── context/           Auth, workspace, toast, permissions
│       ├── shared/              Reusable UI components
│       └── services/api.ts    API client
├── scripts/
│   └── capture-screenshots.mjs  Playwright screenshot tool
├── screenshots/             UI captures (see screenshots/README.md)
└── README.md
```

---

## Features

### Workspaces
- Create workspaces with **name + description only** — no local folder path required
- Switch active workspace; internal uploads stored under `data/uploads/{workspaceId}`
- Workspace overview, members, teams, roles, and permission matrix

### Work management
- **Tasks** — status, priority, severity, due dates, multi-assignee, subtasks, comments, file attachments
- **Issues** — severity, status workflow, assignees, linked subtasks
- **Subtasks** — attach to tasks or issues
- **Assignments** — unified view of all assigned work items

### Collaboration
- **Comments** on tasks, issues, and subtasks
- **Notifications** for assignments, creates, updates, deletes, comments, files
- **Activity log** — workspace and entity-level audit trail
- **Teams** and **member invitations** with role-based permissions

### Other
- **Dashboard** — stats, severity charts, completion progress, recent activity
- **Files** — upload/download attachments per entity
- **Timesheets** — log hours against tasks, issues, or subtasks
- **Settings** — profile avatar, account info, active workspace details
- **Toasts** — success/error feedback across CRUD operations

---

## Permissions (RBAC)

Each workspace has system roles (Owner, Admin, Member, etc.) and a configurable permission matrix. Permissions gate routes and UI via `PermissionGate` on the frontend and `workspaceAuth` middleware on the backend.

Examples: `task.view`, `task.create`, `issue.edit`, `workspace.delete`, `member.view`, `file.upload`, `activity.view`.

---

## API overview

| Area | Base path |
|------|-----------|
| Auth | `/api/auth` |
| Users | `/api/users` |
| Workspaces | `/api/workspaces` |
| Tasks | `/api/tasks` |
| Issues | `/api/issues` |
| Subtasks | `/api/subtasks` |
| Comments | `/api/comments` |
| Notifications | `/api/notifications` |
| Activity | `/api/activity-logs` |
| Stats | `/api/stats` |
| Files | `/api/workspaces/:id/files`, `/api/files/:id` |
| Timesheets | `/api/workspaces/:id/time-entries` |
| Roles & members | `/api/workspaces/:id/roles`, `/api/workspaces/:id/members` |

All protected routes require `Authorization: Bearer <token>`.

---

## Screenshots

UI screenshots (with demo data) live in [`screenshots/`](screenshots/). Recapture after starting both servers:

```powershell
npm install --no-save playwright
npx playwright install chromium
node scripts/capture-screenshots.mjs
```

Set `APP_URL=http://localhost:5174` if Vite uses a non-default port.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Backend port |

Database and uploads are stored under `backend/data/` relative to the backend working directory.

---

## Disclaimer

This document and the associated project are **for overview and reference only**. They do not constitute a commitment, service level agreement, or support offering.

THE SOFTWARE IS PROVIDED **“AS IS”**, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM USE OF THIS SOFTWARE.

---

## License

Private project — internal use. No warranty or guarantee.
