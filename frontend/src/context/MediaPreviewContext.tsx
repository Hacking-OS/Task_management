import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../services/api";
import { getMediaKind, mediaKindLabel, type MediaKind } from "../utils/mediaUtils";
import { Icon } from "../shared/icons/Icon";

export interface MediaPreviewItem {
  title: string;
  kind?: MediaKind;
  mimeType?: string;
  /** Direct URL (avatars, public assets). */
  src?: string;
  /** Workspace file — fetched with auth. */
  fileId?: string;
  downloadFilename?: string;
}

interface MediaPreviewContextValue {
  openPreview: (item: MediaPreviewItem) => void;
  closePreview: () => void;
}

const MediaPreviewContext = createContext<MediaPreviewContextValue | null>(null);

export function useMediaPreview(): MediaPreviewContextValue {
  const ctx = useContext(MediaPreviewContext);
  if (!ctx) throw new Error("useMediaPreview must be used within MediaPreviewProvider");
  return ctx;
}

function useBlobUrl(fileId: string | undefined, token: string | null | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !fileId || !token) {
      setUrl(null);
      setLoading(false);
      setError("");
      return;
    }

    let revoked = false;
    setLoading(true);
    setError("");

    api.fetchFileBlob(token, fileId)
      .then((blob) => {
        if (revoked) return;
        setUrl(URL.createObjectURL(blob));
      })
      .catch((e) => {
        if (!revoked) setError((e as Error).message);
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [fileId, token, enabled]);

  return { url, loading, error };
}

function MediaPreviewOverlay({
  item,
  onClose,
}: {
  item: MediaPreviewItem;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const kind = item.kind ?? getMediaKind(item.mimeType ?? "", item.downloadFilename ?? item.title);
  const needsFetch = Boolean(item.fileId);
  const { url: blobUrl, loading, error } = useBlobUrl(item.fileId, token, needsFetch);
  const src = item.src ?? blobUrl ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const download = async () => {
    if (!token) return;
    if (item.fileId) {
      await api.downloadFile(token, item.fileId, item.downloadFilename ?? item.title);
      return;
    }
    if (item.src) {
      const a = document.createElement("a");
      a.href = item.src;
      a.download = item.downloadFilename ?? item.title;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
  };

  const renderBody = () => {
    if (needsFetch && loading) return <p className="media-preview-loading">Loading preview…</p>;
    if (needsFetch && error) return <p className="form-error">{error}</p>;
    if (!src && needsFetch) return null;

    switch (kind) {
      case "image":
        return <img src={src} alt={item.title} className="media-preview-image" />;
      case "video":
        return <video src={src} controls autoPlay className="media-preview-video" />;
      case "audio":
        return (
          <div className="media-preview-audio-wrap">
            <Icon name="file" size={48} />
            <p>{item.title}</p>
            <audio src={src} controls autoPlay className="media-preview-audio" />
          </div>
        );
      case "pdf":
        return <iframe src={src} title={item.title} className="media-preview-pdf" />;
      default:
        return (
          <div className="media-preview-doc">
            <Icon name="file" size={56} />
            <p className="media-preview-doc-title">{item.title}</p>
            <p className="muted">{mediaKindLabel(kind)}{item.mimeType ? ` · ${item.mimeType}` : ""}</p>
            <p className="muted media-preview-doc-hint">Preview is not available for this file type. Download to open it.</p>
            <button type="button" className="btn btn-primary" onClick={download}>Download</button>
          </div>
        );
    }
  };

  return (
    <div className="media-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className={`media-preview-panel media-preview-${kind}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
      >
        <header className="media-preview-header">
          <span className="media-preview-title" title={item.title}>{item.title}</span>
          <div className="media-preview-actions">
            {(item.fileId || item.src) && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={download}>
                Download
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost media-preview-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>
        <div className="media-preview-body">{renderBody()}</div>
      </div>
    </div>
  );
}

export function MediaPreviewProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<MediaPreviewItem | null>(null);

  const openPreview = useCallback((next: MediaPreviewItem) => setItem(next), []);
  const closePreview = useCallback(() => setItem(null), []);

  return (
    <MediaPreviewContext.Provider value={{ openPreview, closePreview }}>
      {children}
      {item && <MediaPreviewOverlay item={item} onClose={closePreview} />}
    </MediaPreviewContext.Provider>
  );
}
