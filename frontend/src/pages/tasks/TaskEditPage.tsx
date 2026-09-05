import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api } from "../../services/api";
import type { Priority, Severity, Task, TaskStatus } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { FormPageSkeleton } from "../../shared/Skeleton";
import { ErrorState } from "../../shared/StateBox";
import { FormField, inputClass } from "../../shared/FormField";
import { SeveritySelect } from "../../shared/SeveritySelect";
import { StatusSelect } from "../../shared/StatusSelect";
import { AssignUsersField, assigneeIdsFrom } from "../../shared/userAssignment";
import { firstFormError, hasFormErrors, validateTaskForm, type FormErrors } from "../../utils/validation";

export function TaskEditPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"title" | "description" | "dueDate">>({});
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!token || !taskId) return;
    api.getTask(token, taskId)
      .then(({ task: t }) => {
        setTask(t);
        setTitle(t.title);
        setDescription(t.description);
        setStatus(t.status);
        setPriority(t.priority);
        setSeverity(t.severity);
        setAssigneeIds(assigneeIdsFrom(t));
        setDueDate(t.due_date?.slice(0, 10) ?? "");
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, taskId]);

  const clearError = (key: keyof typeof fieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !taskId) return;

    const errors = validateTaskForm({ title, description, dueDate });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setSaving(true);
    setSubmitError("");
    try {
      const { task: updated } = await api.updateTask(token, taskId, {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        severity,
        assignee_ids: assigneeIds,
        due_date: dueDate || null,
      });
      toast.updated("Task");
      navigate(`/tasks/${updated.id}`);
    } catch (err) {
      toast.fromError(err, "Could not update task");
      setSubmitError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <FormPageSkeleton />;
  if (loadError && !task) return <ErrorState message={loadError} />;
  if (!task) return <ErrorState message="Task not found." />;

  return (
    <div>
      <PageHeader title="Edit Task" subtitle={task.title} />
      <form className="card form-stack" onSubmit={submit} noValidate>
        <FormField label="Title" required error={fieldErrors.title}>
          <input
            className={inputClass("input", fieldErrors.title)}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError("title");
            }}
            maxLength={200}
          />
        </FormField>

        <FormField label="Description" error={fieldErrors.description}>
          <textarea
            className={inputClass("input", fieldErrors.description)}
            rows={4}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError("description");
            }}
            maxLength={10000}
          />
        </FormField>

        <div className="form-row">
          <FormField label="Status">
            <StatusSelect entityType="task" value={status} onChange={(v) => setStatus(v as TaskStatus)} workspaceId={task.workspace_id ?? undefined} />
          </FormField>
          <FormField label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </FormField>
          <FormField label="Severity">
            <SeveritySelect value={severity} onChange={(v) => setSeverity(v as Severity)} />
          </FormField>
          <FormField label="Due date" error={fieldErrors.dueDate}>
            <input
              type="date"
              className={inputClass("input", fieldErrors.dueDate)}
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                clearError("dueDate");
              }}
            />
          </FormField>
        </div>

        <AssignUsersField entityType="task" value={assigneeIds} onChange={setAssigneeIds} />

        {submitError && <p className="form-error form-summary-error">{submitError}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/tasks/${taskId}`)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
