import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Internal upload storage for a workspace. */
export function getWorkspaceStorageDir(workspaceId: string): string {
  return ensureDir(path.join(UPLOADS_DIR, workspaceId));
}

export function removeWorkspaceStorageDir(workspaceId: string): void {
  const dir = path.join(UPLOADS_DIR, workspaceId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
