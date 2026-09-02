import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requirePermFromBody } from "../middleware/workspaceAuth.js";
import * as commentService from "../services/comments.js";

const router = Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  try {
    const entityType = req.query.entity_type as string;
    const entityId = req.query.entity_id as string;
    if (!entityType || !entityId) {
      res.status(400).json({ error: "entity_type and entity_id are required" });
      return;
    }
    res.json({ comments: commentService.listComments(req.userId!, entityType, entityId) });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", requirePermFromBody("workspace_id", "comment.create"), (req, res) => {
  try {
    const comment = commentService.createComment(req.userId!, req.body);
    res.status(201).json({ comment });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:id", (req, res) => {
  try {
    commentService.deleteComment(req.userId!, req.params.id);
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
