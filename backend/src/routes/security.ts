import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requireWorkspaceOwner } from "../middleware/workspaceAuth.js";
import { paramString } from "../utils/params.js";
import { listSecurityEvents } from "../services/securityEvents.js";

const router = Router();
router.use(authMiddleware);

router.get("/workspaces/:workspaceId/events", requireWorkspaceOwner(), (req, res) => {
  try {
    const workspaceId = paramString(req.params.workspaceId);
    const riskLevel = req.query.risk_level as "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    const events = listSecurityEvents({
      workspaceId,
      riskLevel,
      limit: Number.parseInt(String(req.query.limit ?? "100"), 10) || 100,
    });
    res.json({ events });
  } catch (error) {
    handleServiceError(res, error, req);
  }
});

export default router;
