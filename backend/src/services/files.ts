import fs from "fs";
import path from "path";
import { db } from "../db.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { requirePermission } from "./authorization.js";
import { getWorkspaceStorageDir } from "./workspacePaths.js";
import { logEntityActivity, notifyEntityWatchers, resolveFileStakeholderTarget } from "./entityEvents.js";
import type { FileCategory, WorkspaceFile } from "../types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const AVATAR_DIR = path.join(DATA_DIR, "avatars");
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const FILE_CATEGORIES: FileCategory[] = ["task", "subtask", "issue", "comment", "general"];

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function uploadsDir(workspaceStorage: string, category: FileCategory, entityId: string): string {
  return ensureDir(path.join(workspaceStorage, category, entityId));
}

function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

function workspaceStorageDir(workspaceId: string): string {
  return getWorkspaceStorageDir(workspaceId);
}

function permissionForCategory(category: FileCategory): string {
  switch (category) {
    case "task": return "task.edit";
    case "subtask": return "subtask.edit";
    case "issue": return "issue.edit";
    case "comment": return "comment.create";
    default: return "file.upload";
  }
}

function assertEntityInWorkspace(category: FileCategory, entityId: string, workspaceId: string): void {
  switch (category) {
    case "task": {
      const row = db.prepare("SELECT workspace_id FROM tasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
      if (!row || row.workspace_id !== workspaceId) throw new Error("Task not found in workspace");
      break;
    }
    case "issue": {
      const row = db.prepare("SELECT workspace_id FROM issues WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
      if (!row || row.workspace_id !== workspaceId) throw new Error("Issue not found in workspace");
      break;
    }
    case "subtask": {
      const row = db.prepare("SELECT workspace_id FROM subtasks WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
      if (!row || row.workspace_id !== workspaceId) throw new Error("Subtask not found in workspace");
      break;
    }
    case "comment": {
      const row = db.prepare("SELECT workspace_id FROM comments WHERE id = ?").get(entityId) as { workspace_id: string } | undefined;
      if (!row || row.workspace_id !== workspaceId) throw new Error("Comment not found in workspace");
      break;
    }
    default:
      break;
  }
}

export function listFiles(
  userId: string,
  workspaceId: string,
  filters?: { category?: FileCategory; entity_id?: string }
): WorkspaceFile[] {
  requirePermission(userId, workspaceId, "file.view");
  const params: unknown[] = [workspaceId];
  let sql = "SELECT * FROM workspace_files WHERE workspace_id = ?";
  if (filters?.category) {
    sql += " AND category = ?";
    params.push(filters.category);
  }
  if (filters?.entity_id) {
    sql += " AND entity_id = ?";
    params.push(filters.entity_id);
  }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params) as WorkspaceFile[];
}

export function listFilesByEntity(
  userId: string,
  workspaceId: string,
  category: FileCategory,
  entityId: string
): WorkspaceFile[] {
  requirePermission(userId, workspaceId, "file.view");
  assertEntityInWorkspace(category, entityId, workspaceId);
  return db.prepare(`
    SELECT * FROM workspace_files
    WHERE workspace_id = ? AND category = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, category, entityId) as WorkspaceFile[];
}

export function uploadCategorizedFile(
  userId: string,
  workspaceId: string,
  category: FileCategory,
  entityId: string,
  filename: string,
  mimeType: string,
  content: Buffer
): WorkspaceFile {
  if (content.length > MAX_FILE_BYTES) throw new Error("File exceeds 15 MB limit");

  requirePermission(userId, workspaceId, permissionForCategory(category));
  if (category !== "general") {
    assertEntityInWorkspace(category, entityId, workspaceId);
  }
  requirePermission(userId, workspaceId, "file.upload");

  const storageDir = workspaceStorageDir(workspaceId);
  const safeName = sanitizeFilename(filename);
  const dir = uploadsDir(storageDir, category, entityId);
  const stored = path.join(dir, `${crypto.randomUUID()}-${safeName}`);
  fs.writeFileSync(stored, content);

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO workspace_files (id, user_id, workspace_id, filename, stored_path, size, category, entity_id, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, workspaceId, safeName, stored, content.length, category, entityId, mimeType || "application/octet-stream");

  const file = db.prepare("SELECT * FROM workspace_files WHERE id = ?").get(id) as WorkspaceFile;

  ActivityLogger.log({
    userId,
    workspaceId,
    entityType: category,
    entityId,
    action: "file_uploaded",
    description: `Uploaded "${safeName}" to ${category}`,
    metadata: { file_id: id, filename: safeName, category },
  });
  notify({
    userId,
    type: "file",
    title: "File uploaded",
    message: `"${safeName}" was attached to ${category}.`,
    workspaceId,
    entityType: "file",
    entityId: file.id,
  });

  const stakeholder = resolveFileStakeholderTarget(category, entityId);
  if (stakeholder) {
    const title = category === "task"
      ? (db.prepare("SELECT title FROM tasks WHERE id = ?").get(entityId) as { title: string } | undefined)?.title ?? "task"
      : category === "issue"
        ? (db.prepare("SELECT title FROM issues WHERE id = ?").get(entityId) as { title: string } | undefined)?.title ?? "issue"
        : category === "subtask"
          ? (db.prepare("SELECT title FROM subtasks WHERE id = ?").get(entityId) as { title: string } | undefined)?.title ?? "subtask"
          : "item";
    notifyEntityWatchers(userId, workspaceId, stakeholder.type, stakeholder.id, title, "file_uploaded");
  }

  return file;
}

export function getFile(userId: string, fileId: string): WorkspaceFile | undefined {
  const file = db.prepare("SELECT * FROM workspace_files WHERE id = ?").get(fileId) as WorkspaceFile | undefined;
  if (!file) return undefined;
  requirePermission(userId, file.workspace_id, "file.view");
  return file;
}

export function readFileContent(userId: string, fileId: string): { file: WorkspaceFile; buffer: Buffer } {
  const file = getFile(userId, fileId);
  if (!file) throw new Error("File not found");
  requirePermission(userId, file.workspace_id, "file.download");
  if (!fs.existsSync(file.stored_path)) throw new Error("File missing on disk");
  return { file, buffer: fs.readFileSync(file.stored_path) };
}

export function deleteFile(userId: string, fileId: string): void {
  const file = db.prepare("SELECT * FROM workspace_files WHERE id = ?").get(fileId) as WorkspaceFile | undefined;
  if (!file) throw new Error("File not found");
  requirePermission(userId, file.workspace_id, "file.delete");
  if (file.user_id !== userId) {
    requirePermission(userId, file.workspace_id, "workspace.edit");
  }

  if (fs.existsSync(file.stored_path)) fs.unlinkSync(file.stored_path);
  db.prepare("DELETE FROM workspace_files WHERE id = ?").run(fileId);

  ActivityLogger.log({
    userId,
    workspaceId: file.workspace_id,
    entityType: "file",
    entityId: fileId,
    action: "deleted",
    description: `File "${file.filename}" was deleted`,
    metadata: { category: file.category, parent_entity_id: file.entity_id },
  });

  if (file.category !== "general" && file.entity_id) {
    logEntityActivity({
      userId,
      workspaceId: file.workspace_id,
      entityType: file.category,
      entityId: file.entity_id,
      action: "file_deleted",
      description: `File "${file.filename}" was removed`,
      metadata: { file_id: fileId, filename: file.filename },
    });
  }

  notify({
    userId,
    type: "file",
    title: "File deleted",
    message: `"${file.filename}" was removed.`,
    workspaceId: file.workspace_id,
    entityType: "file",
    entityId: fileId,
  });

  const stakeholder = file.entity_id ? resolveFileStakeholderTarget(file.category, file.entity_id) : null;
  if (stakeholder) {
    const title =
      stakeholder.type === "task"
        ? (db.prepare("SELECT title FROM tasks WHERE id = ?").get(stakeholder.id) as { title: string } | undefined)?.title ?? "task"
        : stakeholder.type === "issue"
          ? (db.prepare("SELECT title FROM issues WHERE id = ?").get(stakeholder.id) as { title: string } | undefined)?.title ?? "issue"
          : (db.prepare("SELECT title FROM subtasks WHERE id = ?").get(stakeholder.id) as { title: string } | undefined)?.title ?? "subtask";
    notifyEntityWatchers(userId, file.workspace_id, stakeholder.type, stakeholder.id, title, "file_deleted");
  }
}

export function uploadUserAvatar(
  userId: string,
  filename: string,
  mimeType: string,
  content: Buffer
): { avatar_url: string } {
  if (!AVATAR_MIMES.has(mimeType)) throw new Error("Avatar must be JPEG, PNG, WebP, or GIF");
  if (content.length > MAX_AVATAR_BYTES) throw new Error("Avatar exceeds 2 MB limit");

  ensureDir(AVATAR_DIR);
  const ext = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".gif";
  const stored = path.join(AVATAR_DIR, `${userId}${ext}`);

  const prev = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(userId) as { avatar_path: string | null } | undefined;
  if (prev?.avatar_path && fs.existsSync(prev.avatar_path) && prev.avatar_path !== stored) {
    fs.unlinkSync(prev.avatar_path);
  }

  fs.writeFileSync(stored, content);
  db.prepare("UPDATE users SET avatar_path = ? WHERE id = ?").run(stored, userId);

  ActivityLogger.log({
    userId,
    entityType: "user",
    entityId: userId,
    action: "avatar_updated",
    description: "User avatar was updated",
  });

  return { avatar_url: `/api/users/${userId}/avatar` };
}

export function getUserAvatarPath(userId: string): string | null {
  const row = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(userId) as { avatar_path: string | null } | undefined;
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return null;
  return row.avatar_path;
}

export function avatarUrlForUser(userId: string): string | null {
  return getUserAvatarPath(userId) ? `/api/users/${userId}/avatar` : null;
}

// Legacy alias
export function uploadFile(
  userId: string,
  workspaceId: string,
  workspaceRoot: string,
  filename: string,
  content: Buffer
): WorkspaceFile {
  return uploadCategorizedFile(userId, workspaceId, "general", workspaceId, filename, "application/octet-stream", content);
}

export function listFilesLegacy(userId: string, workspaceId: string): WorkspaceFile[] {
  return listFiles(userId, workspaceId);
}
