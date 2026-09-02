import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import type { Issue, Severity, Subtask, Task } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState, EmptyState } from "../../shared/StateBox";
import { SeverityBadge } from "../../shared/SeverityBadge";
import { SeveritySelect } from "../../shared/SeveritySelect";
import { StatusBadge } from "../../shared/StatusBadge";
import { StatusSelect } from "../../shared/StatusSelect";
import { AssigneePicker, assigneeIdsFrom } from "../../shared/AssigneePicker";
import { FormField, inputClass } from "../../shared/FormField";
import { UserAssignee } from "../../shared/UserAssignee";
import { FileAttachments } from "../../shared/FileAttachments";
import { formatDate } from "../../utils/severity";
import { firstFormError, hasFormErrors, validateSubtaskForm } from "../../utils/validation";

export function SubtasksPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editWorkspaceId, setEditWorkspaceId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState(searchParams.get("task_id") ?? "");
  const [issueId, setIssueId] = useState(searchParams.get("issue_id") ?? "");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [status, setStatus] = useState<string>("todo");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; parent?: string }>({});
  const [submitError, setSubmitError] = useState("");

  const load = () => {
    if (!token || !activeWorkspace?.id) return;
    setLoading(true);
    setError("");
    Promise.all([
      api.getSubtasks(token, { workspace_id: activeWorkspace.id }),
      api.getTasks(token, activeWorkspace.id),
      api.getIssues(token, activeWorkspace.id),
    ])
      .then(([s, t, i]) => {
        setSubtasks(s.subtasks);
        setTasks(t.tasks);
        setIssues(i.issues);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, activeWorkspace?.id]);

  const taskMap = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t])), [tasks]);
  const issueMap = useMemo(() => Object.fromEntries(issues.map((i) => [i.id, i])), [issues]);

  const filtered = useMemo(() => {
    let list = subtasks.filter((s) => !activeWorkspace?.id || s.workspace_id === activeWorkspace.id || !s.workspace_id);
    if (taskId) list = list.filter((s) => s.task_id === taskId);
    if (issueId) list = list.filter((s) => s.issue_id === issueId);
    if (severityFilter !== "all") list = list.filter((s) => s.severity === severityFilter);
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    return list;
  }, [subtasks, activeWorkspace?.id, taskId, issueId, severityFilter, statusFilter]);

  const resetForm = () => {
    setTitle("");
    setTaskId(searchParams.get("task_id") ?? "");
    setIssueId(searchParams.get("issue_id") ?? "");
    setSeverity("medium");
    setStatus("todo");
    setAssigneeIds([]);
    setEditId(null);
    setEditWorkspaceId(null);
    setShowForm(false);
    setFieldErrors({});
    setSubmitError("");
  };

  const startEdit = (s: Subtask) => {
    setEditId(s.id);
    setEditWorkspaceId(s.workspace_id ?? activeWorkspace?.id ?? null);
    setTitle(s.title);
    setTaskId(s.task_id ?? "");
    setIssueId(s.issue_id ?? "");
    setSeverity(s.severity);
    setStatus(s.status);
    setAssigneeIds(assigneeIdsFrom(s));
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors = validateSubtaskForm({ title, taskId, issueId });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setSubmitError("");
    try {
      if (editId) {
        await api.updateSubtask(token, editId, { title: title.trim(), severity, status, assignee_ids: assigneeIds, task_id: taskId || null, issue_id: issueId || null });
        toast.updated("Subtask");
      } else {
        await api.createSubtask(token, {
          title: title.trim(),
          severity,
          assignee_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
          task_id: taskId || undefined,
          issue_id: issueId || undefined,
          workspace_id: activeWorkspace?.id,
        });
        toast.created("Subtask");
      }
      resetForm();
      load();
    } catch (err) {
      toast.fromError(err, editId ? "Could not update subtask" : "Could not create subtask");
      setSubmitError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!token || !confirm("Delete subtask?")) return;
    try {
      await api.deleteSubtask(token, id);
      toast.deleted("Subtask");
      load();
    } catch (err) {
      toast.fromError(err, "Could not delete subtask");
    }
  };

  if (workspaceLoading || (loading && !error)) return <TablePageSkeleton cols={9} filters={4} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Subtasks"
        subtitle="Break down tasks and issues into smaller units of work."
        actions={
          <PermissionGate permission="subtask.create">
            <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
              Create Subtask
            </button>
          </PermissionGate>
        }
      />

      <div className="filters-bar card">
        <select className="select" value={taskId} onChange={(e) => { setTaskId(e.target.value); setSearchParams(e.target.value ? { task_id: e.target.value } : {}); }}>
          <option value="">All parent tasks</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        <select className="select" value={issueId} onChange={(e) => { setIssueId(e.target.value); }}>
          <option value="">All parent issues</option>
          {issues.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </select>
        <StatusSelect entityType="subtask" value={statusFilter} onChange={setStatusFilter} includeAll className="select" />
        <SeveritySelect value={severityFilter} onChange={setSeverityFilter} includeAll />
      </div>

      {showForm && (
        <>
          <form className="card form-stack mb-lg" onSubmit={submit} noValidate>
            <h3 className="card-title">{editId ? "Edit subtask" : "New subtask"}</h3>
            <FormField label="Title" required error={fieldErrors.title}>
              <input
                className={inputClass("input", fieldErrors.title)}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }}
                maxLength={200}
              />
            </FormField>
            <div className="form-row">
              <FormField label="Parent task" error={fieldErrors.parent}>
                <select
                  className={inputClass("select", fieldErrors.parent)}
                  value={taskId}
                  onChange={(e) => {
                    setTaskId(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, parent: undefined }));
                  }}
                >
                  <option value="">None</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </FormField>
              <FormField label="Parent issue" error={fieldErrors.parent}>
                <select
                  className={inputClass("select", fieldErrors.parent)}
                  value={issueId}
                  onChange={(e) => {
                    setIssueId(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, parent: undefined }));
                  }}
                >
                  <option value="">None</option>
                  {issues.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
              </FormField>
              <FormField label="Severity">
                <SeveritySelect value={severity} onChange={(v) => setSeverity(v as Severity)} />
              </FormField>
              {editId && (
                <FormField label="Status">
                  <StatusSelect entityType="subtask" value={status} onChange={setStatus} workspaceId={editWorkspaceId ?? undefined} />
                </FormField>
              )}
            </div>
            <div className="form-field-assignees">
              <span>Assignees</span>
              <AssigneePicker value={assigneeIds} onChange={setAssigneeIds} />
            </div>
            {submitError && <p className="form-error form-summary-error">{submitError}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editId ? "Save" : "Create"}</button>
            </div>
          </form>
          {editId && editWorkspaceId && (
            <FileAttachments
              workspaceId={editWorkspaceId}
              category="subtask"
              entityId={editId}
              uploadPermission="subtask.edit"
            />
          )}
        </>
      )}

      {filtered.length === 0 ? (
        <EmptyState message="No subtasks found." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subtask</th>
                <th>Parent Task</th>
                <th>Parent Issue</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Assignee</th>
                <th>Progress</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.task_id ? <Link to={`/tasks/${s.task_id}`}>{taskMap[s.task_id]?.title ?? s.task_id.slice(0, 8)}</Link> : "—"}</td>
                  <td>{s.issue_id ? <Link to={`/issues/${s.issue_id}`}>{issueMap[s.issue_id]?.title ?? s.issue_id.slice(0, 8)}</Link> : "—"}</td>
                  <td><StatusBadge entityType="subtask" slug={s.status} workspaceId={s.workspace_id ?? undefined} compact /></td>
                  <td><SeverityBadge severity={s.severity} compact /></td>
                  <td><UserAssignee userIds={assigneeIdsFrom(s)} showName={false} size="sm" /></td>
                  <td>{s.status === "done" ? "100%" : "0%"}</td>
                  <td>{formatDate(s.updated_at)}</td>
                  <td className="actions-cell">
                    <PermissionGate permission="subtask.edit">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(s)}>Edit</button>
                    </PermissionGate>
                    <PermissionGate permission="subtask.delete">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
