import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requirePermFromQuery } from "../middleware/workspaceAuth.js";
import * as notifService from "../services/notifications.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermFromQuery("workspace_id", "notification.view"), (req, res) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const workspaceId = req.query.workspace_id as string | undefined;
    res.json({
      notifications: notifService.listNotifications(req.userId!, unreadOnly, workspaceId),
      unreadCount: notifService.unreadCount(req.userId!),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

function markRead(req: import("express").Request, res: import("express").Response): void {
  try {
    const id = String(req.params.id);
    const ok = notifService.markNotificationRead(req.userId!, id);
    if (!ok) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json({ unreadCount: notifService.unreadCount(req.userId!) });
  } catch (error) {
    handleServiceError(res, error);
  }
}

router.patch("/:id/read", markRead);
router.put("/:id/read", markRead);

function readAll(req: import("express").Request, res: import("express").Response): void {
  try {
    notifService.markAllNotificationsRead(req.userId!);
    res.json({ unreadCount: 0 });
  } catch (error) {
    handleServiceError(res, error);
  }
}

router.post("/read-all", readAll);
router.put("/read-all", readAll);

router.delete("/:id", (req, res) => {
  try {
    const ok = notifService.deleteNotification(req.userId!, String(req.params.id));
    if (!ok) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
