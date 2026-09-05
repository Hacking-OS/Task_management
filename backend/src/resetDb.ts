import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILES = ["app.db", "app.db-wal", "app.db-shm", "jellyfish.db"];

function removeDbFiles(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return;
  }

  for (const name of DB_FILES) {
    const filePath = path.join(DATA_DIR, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      fs.unlinkSync(filePath);
      console.log(`Removed ${filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not remove ${filePath}: ${message}. Stop the backend dev server and run "npm run reset-db" again.`
      );
    }
  }
}

removeDbFiles();

const { initDb } = await import("./db.js");
initDb();

console.log("Database reset and demo data seeded.");
