import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requirePermFromQuery } from "../middleware/workspaceAuth.js";
import { getSeverityStats, getDashboardStats } from "../services/stats.js";

const router = Router();
router.use(authMiddleware);

router.get("/severity", requirePermFromQuery("workspace_id", "task.view"), (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string | undefined;
    res.json({ stats: getSeverityStats(req.userId!, workspaceId) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/dashboard", requirePermFromQuery("workspace_id", "workspace.view"), (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string | undefined;
    res.json({ stats: getDashboardStats(req.userId!, workspaceId) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
