import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useMediaPreview } from "../../context/MediaPreviewContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { FileCategory, WorkspaceFile } from "../../models/types";
import { getMediaKind } from "../../utils/mediaUtils";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState, ErrorState } from "../../shared/StateBox";
import { Icon } from "../../shared/icons/Icon";
import { PermissionGate } from "../../shared/PermissionGate";

const CATEGORIES: { id: FileCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "task", label: "Tasks" },
  { id: "subtask", label: "Subtasks" },
  { id: "issue", label: "Issues" },
  { id: "comment", label: "Comments" },
  { id: "general", label: "General" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { openPreview } = useMediaPreview();
  const { activeWorkspace } = useWorkspace();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [category, setCategory] = useState<FileCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const filters = category === "all" ? undefined : { category };
    api.listFiles(token, activeWorkspace.id, filters)
      .then(({ files: f }) => setFiles(f))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, activeWorkspace?.id, category]);

  const grouped = useMemo(() => {
    const map = new Map<FileCategory, WorkspaceFile[]>();
    for (const f of files) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [files]);

  const download = async (file: WorkspaceFile) => {
    if (!token) return;
    await api.downloadFile(token, file.id, file.filename);
  };

  const preview = (file: WorkspaceFile) => {
    openPreview({
      title: file.filename,
      fileId: file.id,
      mimeType: file.mime_type,
      downloadFilename: file.filename,
      kind: getMediaKind(file.mime_type, file.filename),
    });
  };

  const remove = async (fileId: string) => {
    if (!token || !confirm("Delete this file?")) return;
    try {
      await api.deleteFile(token, fileId);
      if (activeWorkspace) {
        const filters = category === "all" ? undefined : { category };
        const { files: f } = await api.listFiles(token, activeWorkspace.id, filters);
        setFiles(f);
      }
      toast.deleted("File");
    } catch (err) {
      toast.fromError(err, "Could not delete file");
    }
  };

  if (!activeWorkspace) return <EmptyState message="Select or create a workspace to continue." />;
  if (loading) return <TablePageSkeleton cols={6} filters={1} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader title="Files" subtitle="Uploaded attachments by category" />

      <div className="filters-bar card">
        <div className="tab-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`tab-btn${category === c.id ? " active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {files.length === 0 ? (
        <EmptyState message="No uploaded files in this category." />
      ) : category === "all" ? (
        <div className="file-category-groups">
          {CATEGORIES.filter((c) => c.id !== "all").map((c) => {
            const list = grouped.get(c.id as FileCategory) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={c.id} className="card">
                <h3 className="card-title">{c.label}</h3>
                <FileTable files={list} onDownload={download} onPreview={preview} onDelete={remove} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card-table-wrap">
          <FileTable files={files} onDownload={download} onPreview={preview} onDelete={remove} showCategory />
        </div>
      )}
    </div>
  );
}

function FileTable({
  files,
  onDownload,
  onPreview,
  onDelete,
  showCategory,
}: {
  files: WorkspaceFile[];
  onDownload: (f: WorkspaceFile) => void;
  onPreview: (f: WorkspaceFile) => void;
  onDelete: (id: string) => void;
  showCategory?: boolean;
}) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Name</th>
          {showCategory && <th>Category</th>}
          <th>Entity</th>
          <th>Size</th>
          <th>Type</th>
          <th>Uploaded</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {files.map((f) => (
          <tr key={f.id}>
            <td>
              <span className="file-row-icon">
                <Icon name="file" size={16} />
                <button type="button" className="link-primary link-btn" onClick={() => onPreview(f)}>
                  {f.filename}
                </button>
              </span>
            </td>
            {showCategory && <td><span className="badge">{f.category}</span></td>}
            <td className="mono">{f.entity_id?.slice(0, 8) ?? "—"}</td>
            <td>{formatSize(f.size)}</td>
            <td>{f.mime_type}</td>
            <td>{new Date(f.created_at).toLocaleDateString()}</td>
            <td className="actions-cell">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onPreview(f)}>Preview</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => onDownload(f)}>Download</button>
              <PermissionGate permission="file.delete">
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(f.id)}>Delete</button>
              </PermissionGate>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
