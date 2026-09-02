import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requirePermFromQuery } from "../middleware/workspaceAuth.js";
import { ActivityLogger } from "../services/activityLogger.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermFromQuery("workspace_id", "activity.view"), (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string | undefined;
    const entityType = req.query.entity_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    res.json({
      logs: ActivityLogger.list({
        userId: req.userId!,
        workspaceId,
        entityType,
        entityId,
      }),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
