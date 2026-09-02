import cors from "cors";
import express from "express";
import http from "http";
import { initDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import taskRoutes from "./routes/tasks.js";
import issueRoutes from "./routes/issues.js";
import subtaskRoutes from "./routes/subtasks.js";
import commentRoutes from "./routes/comments.js";
import notificationRoutes from "./routes/notifications.js";
import activityLogRoutes from "./routes/activityLogs.js";
import statsRoutes from "./routes/stats.js";
import timeEntryRoutes from "./routes/timeEntries.js";
import workspaceRoutes from "./routes/workspaces.js";
import workspaceCollaborationRoutes, { invitationRouter } from "./routes/workspaceCollaboration.js";
import workspaceFileRoutes, { fileDownloadRouter } from "./routes/files.js";
import { initSocket } from "./socket.js";

initDb();

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "jellyfish-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/subtasks", subtaskRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/workspaces/:workspaceId/files", workspaceFileRoutes);
app.use("/api/workspaces/:workspaceId/time-entries", timeEntryRoutes);
app.use("/api/workspaces/:workspaceId", workspaceCollaborationRoutes);
app.use("/api/files", fileDownloadRouter);
app.use("/api/invitations", invitationRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  console.error("[api]", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
});

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Jellyfish backend running on http://localhost:${PORT}`);
});
