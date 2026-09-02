export type MediaKind = "image" | "video" | "audio" | "pdf" | "document" | "unknown";

const DOC_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
  "text/markdown",
]);

function ext(filename?: string): string {
  if (!filename) return "";
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

export function getMediaKind(mimeType: string, filename?: string): MediaKind {
  const mime = (mimeType || "").toLowerCase();
  const e = ext(filename);

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || e === "pdf") return "pdf";
  if (DOC_MIMES.has(mime)) return "document";

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(e)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(e)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac"].includes(e)) return "audio";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md", "json"].includes(e)) return "document";

  return "unknown";
}

export function hasThumbnail(kind: MediaKind): boolean {
  return kind === "image" || kind === "video";
}

export function mediaKindLabel(kind: MediaKind): string {
  switch (kind) {
    case "image": return "Image";
    case "video": return "Video";
    case "audio": return "Audio";
    case "pdf": return "PDF";
    case "document": return "Document";
    default: return "File";
  }
}
