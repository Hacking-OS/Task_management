import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  handleServiceError,
  requireMembershipFromParam,
  requirePermFromParam,
} from "../middleware/workspaceAuth.js";
import { paramString } from "../utils/params.js";
import * as wsService from "../services/workspaces.js";
import { ActivityLogger } from "../services/activityLogger.js";
import { isWorkspaceCreator } from "../services/authorization.js";

const router = Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  try {
    res.json({
      workspaces: wsService.listWorkspacesWithMembership(req.userId!),
      active: wsService.getActiveWorkspace(req.userId!),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const workspace = wsService.createWorkspace(req.userId!, name, description);
    res.status(201).json({ workspace });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id", requirePermFromParam("id", "workspace.view"), (req, res) => {
  try {
    const workspace = wsService.getWorkspace(req.userId!, paramString(req.params.id));
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    res.json({ workspace, permissions: wsService.getWorkspacePermissions(req.userId!, paramString(req.params.id)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/:id/activate", requireMembershipFromParam("id"), (req, res) => {
  try {
    const workspace = wsService.activateWorkspace(req.userId!, paramString(req.params.id));
    res.json({ workspace });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:id", requirePermFromParam("id", "workspace.edit"), (req, res) => {
  try {
    const workspace = wsService.updateWorkspace(req.userId!, paramString(req.params.id), req.body);
    res.json({ workspace });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:id", requirePermFromParam("id", "workspace.delete"), (req, res) => {
  try {
    wsService.deleteWorkspace(req.userId!, paramString(req.params.id));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:id/approval-flows", requireMembershipFromParam("id"), (req, res) => {
  try {
    const workspaceId = paramString(req.params.id);
    if (!isWorkspaceCreator(req.userId!, workspaceId)) {
      res.status(403).json({ error: "Only the workspace creator can change approval flow settings" });
      return;
    }
    const enabled = req.body.enabled !== false;
    wsService.setApprovalFlowsEnabled(req.userId!, workspaceId, enabled);
    const workspace = wsService.getWorkspace(req.userId!, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    res.json({ workspace });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id/activity", requirePermFromParam("id", "activity.view"), (req, res) => {
  try {
    wsService.getWorkspace(req.userId!, paramString(req.params.id));
    res.json({
      logs: ActivityLogger.list({
        userId: req.userId!,
        workspaceId: paramString(req.params.id),
        limit: 100,
      }),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
