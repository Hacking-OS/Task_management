import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  handleServiceError,
  requireEntityPerm,
  requirePermFromBody,
  requirePermFromQuery,
} from "../middleware/workspaceAuth.js";
import { paramString } from "../utils/params.js";
import * as subtaskService from "../services/subtasks.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermFromQuery("workspace_id", "subtask.view"), (req, res) => {
  try {
    res.json({
      subtasks: subtaskService.listSubtasks(req.userId!, {
        task_id: req.query.task_id as string | undefined,
        issue_id: req.query.issue_id as string | undefined,
        severity: req.query.severity as import("../types.js").Severity | undefined,
        workspace_id: req.query.workspace_id as string | undefined,
      }),
    });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", requirePermFromBody("workspace_id", "subtask.create"), (req, res) => {
  try {
    const subtask = subtaskService.createSubtask(req.userId!, req.body);
    res.status(201).json({ subtask });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:id", requireEntityPerm("subtasks", "subtask.edit"), (req, res) => {
  try {
    const subtask = subtaskService.updateSubtask(req.userId!, paramString(req.params.id), req.body);
    res.json({ subtask });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:id", requireEntityPerm("subtasks", "subtask.delete"), (req, res) => {
  try {
    subtaskService.deleteSubtask(req.userId!, paramString(req.params.id));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
