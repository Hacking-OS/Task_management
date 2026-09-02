import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  handleServiceError,
  requireEntityPerm,
  requirePermFromBody,
  requirePermFromQuery,
} from "../middleware/workspaceAuth.js";
import { paramString } from "../utils/params.js";
import * as issueService from "../services/issues.js";
import { ActivityLogger } from "../services/activityLogger.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermFromQuery("workspace_id", "issue.view"), (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string | undefined;
    const severity = req.query.severity as import("../types.js").Severity | undefined;
    res.json({ issues: issueService.listIssues(req.userId!, workspaceId, severity) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id", requireEntityPerm("issues", "issue.view"), (req, res) => {
  try {
    const issue = issueService.getIssue(req.userId!, paramString(req.params.id));
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    res.json({ issue });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id/activity", requireEntityPerm("issues", "issue.view"), (req, res) => {
  try {
    const issue = issueService.getIssue(req.userId!, paramString(req.params.id));
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    res.json({ logs: ActivityLogger.forEntity(req.userId!, "issue", paramString(req.params.id)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", requirePermFromBody("workspace_id", "issue.create"), (req, res) => {
  try {
    const issue = issueService.createIssue(req.userId!, req.body);
    res.status(201).json({ issue });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:id", requireEntityPerm("issues", "issue.edit"), (req, res) => {
  try {
    const issue = issueService.updateIssue(req.userId!, paramString(req.params.id), req.body);
    res.json({ issue });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:id", requireEntityPerm("issues", "issue.delete"), (req, res) => {
  try {
    issueService.deleteIssue(req.userId!, paramString(req.params.id));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
