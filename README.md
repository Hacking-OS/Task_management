# Jellyfish Workspace

A user-friendly **TypeScript React** frontend with a **TypeScript Express** backend for:

- **User login & registration** (with login notifications)
- **Task management** (create, update status, delete)
- **Notifications** (login, tasks, workspaces)
- **Simple workspace management** (add local folders, activate, browse root contents)

## Quick start

```powershell
# Install dependencies
npm run install:all

# Run both backend (port 4000) and frontend (port 5173)
npm run dev
```

Open **http://localhost:5173**

### Demo account

- Username: `demo`
- Password: `demo1234`

## Project structure

```
backend/          Express + SQLite API
frontend/         React + TypeScript UI
data/app.db       SQLite database (created on first run)
```

## API overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Sign in |
| `POST /api/auth/register` | Create account |
| `GET /api/tasks` | List tasks |
| `POST /api/tasks` | Create task |
| `GET /api/notifications` | List notifications |
| `GET /api/workspaces` | List workspaces |
| `POST /api/workspaces` | Add workspace (local path) |
| `POST /api/workspaces/:id/activate` | Set active workspace |

## Features

- VS Code-inspired activity bar and sidebar
- Dark / light theme toggle
- Login triggers a welcome notification
- Tasks and workspace actions generate notifications
- Workspaces reference real local directories (never copied)
