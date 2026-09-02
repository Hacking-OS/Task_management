import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  handleServiceError,
  requireEntityPerm,
  requirePermFromBody,
  requirePermFromQuery,
} from "../middleware/workspaceAuth.js";
import { paramString } from "../utils/params.js";
import * as taskService from "../services/tasks.js";
import { ActivityLogger } from "../services/activityLogger.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requirePermFromQuery("workspace_id", "task.view"), (req, res) => {
  try {
    const workspaceId = req.query.workspace_id as string | undefined;
    const severity = req.query.severity as import("../types.js").Severity | undefined;
    res.json({ tasks: taskService.listTasks(req.userId!, workspaceId, severity) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id", requireEntityPerm("tasks", "task.view"), (req, res) => {
  try {
    const task = taskService.getTask(req.userId!, paramString(req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:id/activity", requireEntityPerm("tasks", "task.view"), (req, res) => {
  try {
    const task = taskService.getTask(req.userId!, paramString(req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ logs: ActivityLogger.forEntity(req.userId!, "task", paramString(req.params.id)) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", requirePermFromBody("workspace_id", "task.create"), (req, res) => {
  try {
    const task = taskService.createTask(req.userId!, req.body);
    res.status(201).json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:id", requireEntityPerm("tasks", "task.edit"), (req, res) => {
  try {
    const task = taskService.updateTask(req.userId!, paramString(req.params.id), req.body);
    res.json({ task });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:id", requireEntityPerm("tasks", "task.delete"), (req, res) => {
  try {
    taskService.deleteTask(req.userId!, paramString(req.params.id));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
