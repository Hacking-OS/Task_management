import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMembers } from "../../context/MembersContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useTimesheetBillingReview } from "../../hooks/useTimesheetBillingReview";
import { api } from "../../services/api";
import type { Task, Issue, Subtask, TimeEntry } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState, ErrorState } from "../../shared/StateBox";
import { PermissionGate } from "../../shared/PermissionGate";
import { FormField, inputClass } from "../../shared/FormField";
import { firstFormError, hasFormErrors, validateTimesheetForm, type FormErrors } from "../../utils/validation";
import { parseDateKey, toDateKey } from "../../utils/calendar";
import { EntityTypeBadge, EntityTypePicker } from "../../shared/entityType";
import { TimesheetCalendar } from "./TimesheetCalendar";
import { TimesheetDayPanel } from "./TimesheetDayPanel";

type ViewTab = "calendar" | "list";

function resolveEntryLabel(
  entry: TimeEntry,
  tasks: Task[],
  issues: Issue[],
  subtasks: Subtask[]
): string {
  if (entry.entity_type === "task") return tasks.find((t) => t.id === entry.entity_id)?.title ?? entry.entity_id.slice(0, 8);
  if (entry.entity_type === "issue") return issues.find((i) => i.id === entry.entity_id)?.title ?? entry.entity_id.slice(0, 8);
  return subtasks.find((s) => s.id === entry.entity_id)?.title ?? entry.entity_id.slice(0, 8);
}

export function TimesheetsPage() {
  const { token, user } = useAuth();
  const toast = useToast();
  const { activeWorkspace } = useWorkspace();
  const { getMemberByUserId } = useMembers();
  const { hasPermission, isOwner, roleSlug } = usePermissions();
  const { reviewByEntryId, setEntryStatus, setManyStatus } = useTimesheetBillingReview(activeWorkspace?.id);

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
  const [viewTab, setViewTab] = useState<ViewTab>("calendar");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [entityType, setEntityType] = useState<"task" | "issue" | "subtask">("task");
  const [entityId, setEntityId] = useState("");
  const [workDate, setWorkDate] = useState(() => toDateKey(new Date()));
  const [hours, setHours] = useState("1");
  const [description, setDescription] = useState("");

  const canReviewBilling = isOwner || roleSlug === "admin";

  const entityOptions = useMemo(() => {
    if (entityType === "task") return tasks.map((t) => ({ id: t.id, label: t.title }));
    if (entityType === "issue") return issues.map((i) => ({ id: i.id, label: i.title }));
    return subtasks.map((s) => ({ id: s.id, label: s.title }));
  }, [entityType, tasks, issues, subtasks]);

  const filteredEntries = useMemo(() => {
    if (!selectedDate || dayPanelOpen) return entries;
    return entries.filter((entry) => entry.work_date === selectedDate);
  }, [entries, selectedDate, dayPanelOpen]);

  const load = useCallback(async () => {
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
  }, [token, activeWorkspace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEntityId("");
  }, [entityType]);

  const resolveUserLabel = useCallback(
    (userId: string) => getMemberByUserId(userId)?.username ?? userId.slice(0, 8),
    [getMemberByUserId]
  );

  const handleSelectDate = (dateKey: string | null) => {
    setSelectedDate(dateKey);
    if (!dateKey) {
      setDayPanelOpen(false);
      return;
    }

    setWorkDate(dateKey);
    const d = parseDateKey(dateKey);
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });

    const hasData = entries.some((entry) => entry.work_date === dateKey);
    setDayPanelOpen(hasData);
  };

  const closeDayPanel = () => {
    setDayPanelOpen(false);
  };

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
      if (workDate) {
        setSelectedDate(workDate);
        setDayPanelOpen(true);
      }
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

  const handleReviewAll = (status: "accepted" | "rejected") => {
    if (!selectedDate) return;
    const ids = entries.filter((e) => e.work_date === selectedDate).map((e) => e.id);
    setManyStatus(ids, status);
    toast.success(status === "accepted" ? "Day accepted for billing" : "Day rejected for billing");
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

      {canReviewBilling && (
        <p className="timesheet-billing-hint muted">
          Click a calendar day with logged time to review entries for billing.{" "}
          <Link to="/billing">Billing module</Link> is in development.
        </p>
      )}

      <div className="perm-tabs">
        <button
          type="button"
          className={`perm-tab${viewTab === "calendar" ? " active" : ""}`}
          onClick={() => setViewTab("calendar")}
        >
          Calendar
        </button>
        <button
          type="button"
          className={`perm-tab${viewTab === "list" ? " active" : ""}`}
          onClick={() => {
            setViewTab("list");
            setDayPanelOpen(false);
          }}
        >
          All entries
        </button>
      </div>

      {viewTab === "calendar" && (
        <TimesheetCalendar
          entries={entries}
          year={calendarMonth.year}
          month={calendarMonth.month}
          selectedDate={selectedDate}
          onMonthChange={(year, month) => setCalendarMonth({ year, month })}
          onSelectDate={handleSelectDate}
        />
      )}

      <PermissionGate permission="timesheet.create">
        <section className="card">
          <h3 className="card-title">Log time</h3>
          <form className="form-grid timesheet-form" onSubmit={submit} noValidate>
            <FormField label="Type">
              <EntityTypePicker value={entityType} onChange={setEntityType} disabled={saving} />
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
                  setSelectedDate(e.target.value);
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

      {viewTab === "list" && selectedDate && (
        <div className="timesheet-filter-banner card">
          <span>
            Showing entries for{" "}
            <strong>
              {parseDateKey(selectedDate).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(null)}>
            Show all
          </button>
        </div>
      )}

      {viewTab === "list" && (
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
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.work_date}</td>
                  <td><EntityTypeBadge type={entry.entity_type} compact /></td>
                  <td>{resolveEntryLabel(entry, tasks, issues, subtasks)}</td>
                  <td>{entry.hours.toFixed(2)}</td>
                  <td>{entry.description || "—"}</td>
                  <td>{entry.user_id === user?.id ? "You" : resolveUserLabel(entry.user_id)}</td>
                  {hasPermission("timesheet.delete") && (
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(entry.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={hasPermission("timesheet.delete") ? 7 : 6} className="muted">
                    {selectedDate ? "No time entries on this day." : "No time entries yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <TimesheetDayPanel
        open={dayPanelOpen}
        dateKey={selectedDate}
        entries={entries}
        tasks={tasks}
        issues={issues}
        subtasks={subtasks}
        currentUserId={user?.id}
        resolveUserLabel={resolveUserLabel}
        canReview={canReviewBilling}
        reviewByEntryId={reviewByEntryId}
        onClose={closeDayPanel}
        onReviewEntry={(entryId, status) => {
          setEntryStatus(entryId, status);
          toast.success(
            status === "accepted"
              ? "Entry accepted for billing"
              : status === "rejected"
                ? "Entry rejected for billing"
                : "Review reset"
          );
        }}
        onReviewAll={handleReviewAll}
        canDelete={hasPermission("timesheet.delete")}
        onDelete={remove}
      />
    </div>
  );
}
