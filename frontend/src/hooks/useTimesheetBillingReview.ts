import { useCallback, useEffect, useState } from "react";
import type { TimesheetReviewStatus } from "../pages/timesheets/TimesheetDayPanel";

function storageKey(workspaceId: string): string {
  return `timesheet-billing-review:${workspaceId}`;
}

function readStore(workspaceId: string): Record<string, TimesheetReviewStatus> {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TimesheetReviewStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(workspaceId: string, value: Record<string, TimesheetReviewStatus>) {
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(value));
}

/** Client-side review state until billing APIs exist. */
export function useTimesheetBillingReview(workspaceId: string | undefined) {
  const [reviewByEntryId, setReviewByEntryId] = useState<Record<string, TimesheetReviewStatus>>({});

  useEffect(() => {
    if (!workspaceId) {
      setReviewByEntryId({});
      return;
    }
    setReviewByEntryId(readStore(workspaceId));
  }, [workspaceId]);

  const setEntryStatus = useCallback(
    (entryId: string, status: TimesheetReviewStatus) => {
      if (!workspaceId) return;
      setReviewByEntryId((prev) => {
        const next = { ...prev, [entryId]: status };
        writeStore(workspaceId, next);
        return next;
      });
    },
    [workspaceId]
  );

  const setManyStatus = useCallback(
    (entryIds: string[], status: TimesheetReviewStatus) => {
      if (!workspaceId || entryIds.length === 0) return;
      setReviewByEntryId((prev) => {
        const next = { ...prev };
        for (const id of entryIds) next[id] = status;
        writeStore(workspaceId, next);
        return next;
      });
    },
    [workspaceId]
  );

  return { reviewByEntryId, setEntryStatus, setManyStatus };
}
