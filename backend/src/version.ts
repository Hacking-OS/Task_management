import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

export const APP_NAME = "Jellyfish Workspace";
export const APP_VERSION: string = pkg.version;
