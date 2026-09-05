import { useEffect, useId, useMemo } from "react";
import type { Issue, Subtask, Task, TimeEntry } from "../../models/types";
import { EntityTypeBadge } from "../../shared/entityType";
import { parseDateKey } from "../../utils/calendar";

export type TimesheetReviewStatus = "pending" | "accepted" | "rejected";

interface TimesheetDayPanelProps {
  open: boolean;
  dateKey: string | null;
  entries: TimeEntry[];
  tasks: Task[];
  issues: Issue[];
  subtasks: Subtask[];
  currentUserId?: string;
  resolveUserLabel: (userId: string) => string;
  canReview: boolean;
  reviewByEntryId: Record<string, TimesheetReviewStatus>;
  onClose: () => void;
  onReviewEntry: (entryId: string, status: TimesheetReviewStatus) => void;
  onReviewAll: (status: "accepted" | "rejected") => void;
  onDelete?: (entryId: string) => void;
  canDelete?: boolean;
}

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

function statusBadge(status: TimesheetReviewStatus) {
  if (status === "accepted") return <span className="badge badge-success">Accepted</span>;
  if (status === "rejected") return <span className="badge badge-danger">Rejected</span>;
  return <span className="badge badge-muted">Pending review</span>;
}

export function TimesheetDayPanel({
  open,
  dateKey,
  entries,
  tasks,
  issues,
  subtasks,
  currentUserId,
  resolveUserLabel,
  canReview,
  reviewByEntryId,
  onClose,
  onReviewEntry,
  onReviewAll,
  onDelete,
  canDelete,
}: TimesheetDayPanelProps) {
  const titleId = useId();
  const dayEntries = useMemo(
    () => (dateKey ? entries.filter((e) => e.work_date === dateKey) : []),
    [entries, dateKey]
  );

  const totalHours = useMemo(
    () => dayEntries.reduce((sum, e) => sum + e.hours, 0),
    [dayEntries]
  );

  const pendingCount = useMemo(
    () => dayEntries.filter((e) => (reviewByEntryId[e.id] ?? "pending") === "pending").length,
    [dayEntries, reviewByEntryId]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !dateKey) return null;

  const dateLabel = parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="timesheet-drawer-root" role="presentation">
      <button type="button" className="timesheet-drawer-backdrop" aria-label="Close timesheet panel" onClick={onClose} />
      <aside className="timesheet-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="timesheet-drawer-header">
          <div>
            <h2 id={titleId} className="timesheet-drawer-title">Day timesheet</h2>
            <p className="muted">{dateLabel}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="timesheet-drawer-summary">
          <div className="timesheet-drawer-stat">
            <span className="muted">Hours</span>
            <strong>{totalHours.toFixed(1)}h</strong>
          </div>
          <div className="timesheet-drawer-stat">
            <span className="muted">Entries</span>
            <strong>{dayEntries.length}</strong>
          </div>
          {canReview && (
            <div className="timesheet-drawer-stat">
              <span className="muted">Pending</span>
              <strong>{pendingCount}</strong>
            </div>
          )}
        </div>

        {canReview && dayEntries.length > 0 && (
          <div className="timesheet-drawer-review-bar">
            <p className="resource-section-hint">
              Review logged time for billing. Billing export is in development.
            </p>
            <div className="timesheet-drawer-review-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={dayEntries.length === 0}
                onClick={() => onReviewAll("accepted")}
              >
                Accept all
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={dayEntries.length === 0}
                onClick={() => onReviewAll("rejected")}
              >
                Reject all
              </button>
            </div>
          </div>
        )}

        <div className="timesheet-drawer-body">
          {dayEntries.length === 0 ? (
            <p className="muted">No time logged on this day.</p>
          ) : (
            <ul className="timesheet-drawer-list">
              {dayEntries.map((entry) => {
                const status = reviewByEntryId[entry.id] ?? "pending";
                return (
                  <li key={entry.id} className="timesheet-drawer-item">
                    <div className="timesheet-drawer-item-top">
                      <div>
                        <div className="timesheet-drawer-item-title-row">
                          <EntityTypeBadge type={entry.entity_type} compact />
                          <strong>{resolveEntryLabel(entry, tasks, issues, subtasks)}</strong>
                        </div>
                        <p className="muted">
                          {entry.hours.toFixed(2)}h ·{" "}
                          {entry.user_id === currentUserId ? "You" : resolveUserLabel(entry.user_id)}
                        </p>
                        {entry.description ? <p className="timesheet-drawer-item-desc">{entry.description}</p> : null}
                      </div>
                      {canReview && statusBadge(status)}
                    </div>

                    {(canReview || canDelete) && (
                      <div className="timesheet-drawer-item-actions">
                        {canReview && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={status === "accepted"}
                              onClick={() => onReviewEntry(entry.id, "accepted")}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={status === "rejected"}
                              onClick={() => onReviewEntry(entry.id, "rejected")}
                            >
                              Reject
                            </button>
                            {status !== "pending" && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => onReviewEntry(entry.id, "pending")}
                              >
                                Reset
                              </button>
                            )}
                          </>
                        )}
                        {canDelete && onDelete && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(entry.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
