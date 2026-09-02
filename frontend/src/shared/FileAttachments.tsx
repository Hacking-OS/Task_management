import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useMediaPreview } from "../context/MediaPreviewContext";
import { api } from "../services/api";
import type { FileCategory, WorkspaceFile } from "../models/types";
import { getMediaKind, hasThumbnail, mediaKindLabel } from "../utils/mediaUtils";
import { PermissionGate } from "./PermissionGate";
import { Icon } from "./icons/Icon";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumb({ file, onOpen }: { file: WorkspaceFile; onOpen: () => void }) {
  const { token } = useAuth();
  const kind = getMediaKind(file.mime_type, file.filename);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !hasThumbnail(kind)) return;
    let revoked = false;
    api.fetchFileBlob(token, file.id)
      .then((blob) => {
        if (!revoked) setThumbUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      revoked = true;
      setThumbUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [token, file.id, kind]);

  if (kind === "image" && thumbUrl) {
    return (
      <button type="button" className="attachment-thumb attachment-thumb-image" onClick={onOpen} title={`Preview ${file.filename}`}>
        <img src={thumbUrl} alt="" />
      </button>
    );
  }

  if (kind === "video") {
    return (
      <button type="button" className="attachment-thumb attachment-thumb-video" onClick={onOpen} title={`Preview ${file.filename}`}>
        {thumbUrl ? <video src={thumbUrl} muted playsInline /> : <span className="attachment-thumb-placeholder" />}
        <span className="attachment-thumb-play" aria-hidden>▶</span>
      </button>
    );
  }

  return (
    <button type="button" className="attachment-thumb attachment-thumb-file" onClick={onOpen} title={`Preview ${file.filename}`}>
      <Icon name="file" size={22} />
      <span className="attachment-thumb-ext">{mediaKindLabel(kind)}</span>
    </button>
  );
}

interface FileAttachmentsProps {
  workspaceId: string;
  category: FileCategory;
  entityId: string;
  title?: string;
  uploadPermission?: string;
  variant?: "card" | "inline";
}

export function FileAttachments({
  workspaceId,
  category,
  entityId,
  title = "Attachments",
  uploadPermission = "file.upload",
  variant = "card",
}: FileAttachmentsProps) {
  const { token } = useAuth();
  const toast = useToast();
  const { openPreview } = useMediaPreview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    if (!token) return;
    api.listFiles(token, workspaceId, { category, entity_id: entityId })
      .then(({ files: f }) => setFiles(f))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, workspaceId, category, entityId]);

  const previewFile = (f: WorkspaceFile) => {
    openPreview({
      title: f.filename,
      fileId: f.id,
      mimeType: f.mime_type,
      downloadFilename: f.filename,
      kind: getMediaKind(f.mime_type, f.filename),
    });
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!token || !file) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadFile(token, workspaceId, file, category, entityId);
      load();
      toast.success("File uploaded", `${file.name} was attached successfully.`);
    } catch (err) {
      toast.fromError(err, "Upload failed");
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (fileId: string) => {
    if (!token || !confirm("Delete this file?")) return;
    try {
      await api.deleteFile(token, fileId);
      load();
      toast.deleted("File");
    } catch (err) {
      toast.fromError(err, "Could not delete file");
    }
  };

  const uploadBtn = (
    <PermissionGate permission={uploadPermission}>
      <>
        <input ref={inputRef} type="file" className="sr-only" onChange={onPick} />
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload file"}
        </button>
      </>
    </PermissionGate>
  );

  const list = loading ? (
    <p className="muted">{variant === "inline" ? "…" : "Loading attachments…"}</p>
  ) : files.length === 0 ? (
    variant === "inline" ? null : <p className="muted">No files attached yet.</p>
  ) : (
    <ul className="attachment-list">
      {files.map((f) => (
        <li key={f.id} className="attachment-item">
          <AttachmentThumb file={f} onOpen={() => previewFile(f)} />
          <div className="attachment-meta">
            <button type="button" className="link-primary link-btn" onClick={() => previewFile(f)}>
              {f.filename}
            </button>
            <span className="muted">{formatSize(f.size)} · {mediaKindLabel(getMediaKind(f.mime_type, f.filename))}</span>
          </div>
          <PermissionGate permission="file.delete">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(f.id)}>Remove</button>
          </PermissionGate>
        </li>
      ))}
    </ul>
  );

  if (variant === "inline") {
    if (!loading && files.length === 0 && !error) return null;
    return (
      <div className="attachment-inline">
        {error && <p className="form-error">{error}</p>}
        {list}
      </div>
    );
  }

  return (
    <section className="card file-attachments">
      <div className="card-header-row">
        <h3 className="card-title">{title}</h3>
        {uploadBtn}
      </div>
      {error && <p className="form-error">{error}</p>}
      {list}
    </section>
  );
}

interface AvatarUploadProps {
  onUpdated?: (avatarUrl: string) => void;
}

export function AvatarUpload({ onUpdated }: AvatarUploadProps) {
  const { token, user, refreshUser } = useAuth();
  const toast = useToast();
  const { openPreview } = useMediaPreview();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cacheBust, setCacheBust] = useState(0);

  const avatarUrl = user?.avatar_url ? `${user.avatar_url}?t=${cacheBust}` : "";

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!token || !file) return;
    setUploading(true);
    setError("");
    try {
      const { avatar_url } = await api.uploadAvatar(token, file);
      await refreshUser();
      setCacheBust(Date.now());
      onUpdated?.(avatar_url);
      toast.success("Avatar updated", "Your profile picture was saved.");
    } catch (err) {
      toast.fromError(err, "Avatar upload failed");
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const previewAvatar = () => {
    if (!avatarUrl) return;
    openPreview({
      title: user?.username ?? "Avatar",
      src: avatarUrl,
      kind: "image",
      mimeType: "image/jpeg",
      downloadFilename: `${user?.username ?? "avatar"}.jpg`,
    });
  };

  return (
    <div className="avatar-upload">
      <button
        type="button"
        className={`avatar-preview${avatarUrl ? " avatar-preview-clickable" : ""}`}
        onClick={previewAvatar}
        disabled={!avatarUrl}
        title={avatarUrl ? "View full size" : undefined}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="user-avatar-img" />
        ) : (
          <span className="user-avatar lg">{user?.username?.[0]?.toUpperCase() ?? "U"}</span>
        )}
      </button>
      <div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={onPick} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading…" : "Change avatar"}
        </button>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>JPEG, PNG, WebP or GIF · max 2 MB</p>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
