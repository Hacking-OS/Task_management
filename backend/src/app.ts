import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
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
import securityRoutes from "./routes/security.js";
import { APP_NAME, APP_VERSION } from "./version.js";
import { requestContextMiddleware, securityHeadersMiddleware } from "./middleware/requestContext.js";
import { getAllowedOrigins } from "./config/cookies.js";

/** Factory for Express app — used by server startup and Supertest. */
export function createApp(): express.Application {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requestContextMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin: getAllowedOrigins(),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "jellyfish-backend", version: APP_VERSION, name: APP_NAME });
  });

  app.get("/api/version", (_req, res) => {
    res.json({ name: APP_NAME, version: APP_VERSION });
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
  app.use("/api/security", securityRoutes);

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    console.error("[api]", req.requestId, err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({
      error: process.env.NODE_ENV === "production" ? "Internal server error" : message,
      requestId: req.requestId,
    });
  });

  return app;
}
