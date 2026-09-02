import { Router } from "express";
import multer from "multer";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import { handleServiceError } from "../middleware/workspaceAuth.js";
import * as authService from "../services/auth.js";
import * as fileService from "../services/files.js";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = Router();

router.get("/me", authMiddleware, (req, res) => {
  const user = authService.getUser(req.userId!);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
});

router.post("/me/avatar", authMiddleware, avatarUpload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const result = fileService.uploadUserAvatar(
      req.userId!,
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer
    );
    const user = authService.getUser(req.userId!);
    res.json({ user, ...result });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get("/:userId/avatar", (req, res) => {
  try {
    const userId = String(req.params.userId);
    const avatarPath = fileService.getUserAvatarPath(userId);
    if (!avatarPath) {
      res.status(404).json({ error: "No avatar" });
      return;
    }
    const ext = avatarPath.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(avatarPath).pipe(res);
  } catch (error) {
    handleServiceError(res, error);
  }
});

export default router;
