import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requireWorkspacePerm } from "../middleware/workspaceAuth.js";
import { workspaceIdParam } from "../utils/params.js";
import * as timeEntryService from "../services/timeEntries.js";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get("/", requireWorkspacePerm("timesheet.view"), (req, res) => {
  try {
    const entries = timeEntryService.listTimeEntries(req.userId!, workspaceIdParam(req.params), {
      entity_type: req.query.entity_type as string | undefined,
      entity_id: req.query.entity_id as string | undefined,
      user_id: req.query.user_id as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json({ entries });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/summary", requireWorkspacePerm("timesheet.view"), (req, res) => {
  try {
    const summary = timeEntryService.getTimeSummary(req.userId!, workspaceIdParam(req.params), {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json({ summary });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/", requireWorkspacePerm("timesheet.create"), (req, res) => {
  try {
    const entry = timeEntryService.createTimeEntry(req.userId!, workspaceIdParam(req.params), req.body);
    res.status(201).json({ entry });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch("/:entryId", requireWorkspacePerm("timesheet.edit"), (req, res) => {
  try {
    const entry = timeEntryService.updateTimeEntry(req.userId!, String(req.params.entryId), req.body);
    res.json({ entry });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.delete("/:entryId", requireWorkspacePerm("timesheet.delete"), (req, res) => {
  try {
    timeEntryService.deleteTimeEntry(req.userId!, String(req.params.entryId));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
