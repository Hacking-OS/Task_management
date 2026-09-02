import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePermissions } from "../../context/PermissionsContext";
import { api } from "../../services/api";
import type { Task, Issue, Subtask, TimeEntry } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState, ErrorState } from "../../shared/StateBox";
import { PermissionGate } from "../../shared/PermissionGate";
import { FormField, inputClass } from "../../shared/FormField";
import { firstFormError, hasFormErrors, validateTimesheetForm, type FormErrors } from "../../utils/validation";

export function TimesheetsPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const { activeWorkspace } = useWorkspace();
  const { hasPermission } = usePermissions();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [summary, setSummary] = useState({ totalHours: 0, entryCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"entityId" | "workDate" | "hours" | "description">>({});
  const [saving, setSaving] = useState(false);

  const [entityType, setEntityType] = useState<"task" | "issue" | "subtask">("task");
  const [entityId, setEntityId] = useState("");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("1");
  const [description, setDescription] = useState("");

  const entityOptions = useMemo(() => {
    if (entityType === "task") return tasks.map((t) => ({ id: t.id, label: t.title }));
    if (entityType === "issue") return issues.map((i) => ({ id: i.id, label: i.title }));
    return subtasks.map((s) => ({ id: s.id, label: s.title }));
  }, [entityType, tasks, issues, subtasks]);

  const load = async () => {
    if (!token || !activeWorkspace) return;
    setLoading(true);
    setError("");
    try {
      const [e, s, t, i, st] = await Promise.all([
        api.listTimeEntries(token, activeWorkspace.id),
        api.getTimeSummary(token, activeWorkspace.id),
        api.getTasks(token, activeWorkspace.id),
        api.getIssues(token, activeWorkspace.id),
        api.getSubtasks(token, { workspace_id: activeWorkspace.id }),
      ]);
      setEntries(e.entries);
      setSummary(s.summary);
      setTasks(t.tasks);
      setIssues(i.issues);
      setSubtasks(st.subtasks);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, activeWorkspace?.id]);

  useEffect(() => {
    setEntityId("");
  }, [entityType]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !activeWorkspace) return;

    const errors = validateTimesheetForm({ entityId, workDate, hours, description });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setFormError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await api.createTimeEntry(token, activeWorkspace.id, {
        entity_type: entityType,
        entity_id: entityId,
        work_date: workDate,
        hours: Number(hours),
        description: description.trim(),
      });
      setDescription("");
      setHours("1");
      await load();
      toast.created("Time entry");
    } catch (err) {
      toast.fromError(err, "Could not log time");
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!token || !activeWorkspace || !confirm("Delete this time entry?")) return;
    try {
      await api.deleteTimeEntry(token, activeWorkspace.id, id);
      await load();
      toast.deleted("Time entry");
    } catch (err) {
      toast.fromError(err, "Could not delete time entry");
    }
  };

  if (!activeWorkspace) return <EmptyState message="Select or create a workspace to continue." />;
  if (loading) return <TablePageSkeleton cols={5} filters={1} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Timesheets"
        subtitle={`${summary.totalHours.toFixed(1)} hours logged · ${summary.entryCount} entries`}
      />

      <PermissionGate permission="timesheet.create">
        <section className="card">
          <h3 className="card-title">Log time</h3>
          <form className="form-grid timesheet-form" onSubmit={submit} noValidate>
            <FormField label="Type">
              <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
                <option value="task">Task</option>
                <option value="issue">Issue</option>
                <option value="subtask">Subtask</option>
              </select>
            </FormField>
            <FormField label="Work item" required error={fieldErrors.entityId}>
              <select
                className={inputClass("select", fieldErrors.entityId)}
                value={entityId}
                onChange={(e) => {
                  setEntityId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, entityId: undefined }));
                }}
              >
                <option value="">Select…</option>
                {entityOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Date" required error={fieldErrors.workDate}>
              <input
                className={inputClass("input", fieldErrors.workDate)}
                type="date"
                value={workDate}
                onChange={(e) => {
                  setWorkDate(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, workDate: undefined }));
                }}
              />
            </FormField>
            <FormField label="Hours" required hint="Up to 24 hours per entry." error={fieldErrors.hours}>
              <input
                className={inputClass("input", fieldErrors.hours)}
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, hours: undefined }));
                }}
              />
            </FormField>
            <FormField label="Description" className="span-2" hint="Optional." error={fieldErrors.description}>
              <input
                className={inputClass("input", fieldErrors.description)}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, description: undefined }));
                }}
                placeholder="What did you work on?"
                maxLength={500}
              />
            </FormField>
            {formError && <p className="form-error form-summary-error span-2">{formError}</p>}
            <div className="span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Log time"}</button>
            </div>
          </form>
        </section>
      </PermissionGate>

      <div className="card-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Item</th>
              <th>Hours</th>
              <th>Description</th>
              <th>User</th>
              {hasPermission("timesheet.delete") && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const label =
                entry.entity_type === "task"
                  ? tasks.find((t) => t.id === entry.entity_id)?.title
                  : entry.entity_type === "issue"
                    ? issues.find((i) => i.id === entry.entity_id)?.title
                    : subtasks.find((s) => s.id === entry.entity_id)?.title;
              return (
                <tr key={entry.id}>
                  <td>{entry.work_date}</td>
                  <td><span className="badge">{entry.entity_type}</span></td>
                  <td>{label ?? entry.entity_id.slice(0, 8)}</td>
                  <td>{entry.hours.toFixed(2)}</td>
                  <td>{entry.description || "—"}</td>
                  <td>{entry.user_id === user?.id ? "You" : entry.user_id.slice(0, 8)}</td>
                  {hasPermission("timesheet.delete") && (
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(entry.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr><td colSpan={7} className="muted">No time entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
