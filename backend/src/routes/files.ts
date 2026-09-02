import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError, requireWorkspacePerm } from "../middleware/workspaceAuth.js";
import { workspaceIdParam, paramString } from "../utils/params.js";
import * as fileService from "../services/files.js";
import type { FileCategory } from "../types.js";
import { validateFileCategory, validateEntityId } from "../validation/common.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get("/", requireWorkspacePerm("file.view"), (req, res) => {
  try {
    const category = req.query.category as FileCategory | undefined;
    const entity_id = req.query.entity_id as string | undefined;
    const files = fileService.listFiles(req.userId!, workspaceIdParam(req.params), { category, entity_id });
    res.json({ files });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post("/upload", requireWorkspacePerm("file.upload"), upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const category = validateFileCategory(req.body.category ?? "general");
    const entity_id = req.body.entity_id ? validateEntityId(req.body.entity_id) : undefined;
    if (!entity_id && category !== "general") {
      res.status(400).json({ error: "entity_id is required for this category" });
      return;
    }
    const file = fileService.uploadCategorizedFile(
      req.userId!,
      workspaceIdParam(req.params),
      category,
      entity_id ?? workspaceIdParam(req.params),
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer
    );
    res.status(201).json({ file });
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;

export const fileDownloadRouter = Router();
fileDownloadRouter.use(authMiddleware);

fileDownloadRouter.get("/:fileId", (req, res) => {
  try {
    const { file, buffer } = fileService.readFileContent(req.userId!, paramString(req.params.fileId));
    res.setHeader("Content-Type", file.mime_type ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    res.send(buffer);
  } catch (error) {
    handleServiceError(res, error);
  }
});

fileDownloadRouter.delete("/:fileId", (req, res) => {
  try {
    fileService.deleteFile(req.userId!, paramString(req.params.fileId));
    res.status(204).send();
  } catch (error) {
    handleServiceError(res, error);
  }
});
