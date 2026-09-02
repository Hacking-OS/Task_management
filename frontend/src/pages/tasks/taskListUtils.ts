import { useMemo } from "react";
import type { Task, TaskStatus, Priority, Severity } from "../../models/types";
import { SEVERITY_RANK } from "../../utils/severity";
import { assigneeIdsFrom } from "../../shared/AssigneePicker";

export type TaskSortKey = "title" | "status" | "severity" | "priority" | "due_date" | "updated_at";

export interface TaskFilters {
  search: string;
  status: TaskStatus | "all";
  severity: Severity | "all";
  priority: Priority | "all";
  assignee: string;
  dueBefore: string;
}

export function useTaskList(
  tasks: Task[],
  filters: TaskFilters,
  sortKey: TaskSortKey,
  sortDir: "asc" | "desc",
  page: number,
  pageSize: number,
  currentUserId?: string,
) {
  return useMemo(() => {
    let list = [...tasks];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (filters.status !== "all") list = list.filter((t) => t.status === filters.status);
    if (filters.severity !== "all") list = list.filter((t) => t.severity === filters.severity);
    if (filters.priority !== "all") list = list.filter((t) => t.priority === filters.priority);
    if (filters.assignee === "unassigned") list = list.filter((t) => assigneeIdsFrom(t).length === 0);
    else if (filters.assignee === "me" && currentUserId) list = list.filter((t) => assigneeIdsFrom(t).includes(currentUserId));
    else if (filters.assignee !== "all") list = list.filter((t) => assigneeIdsFrom(t).includes(filters.assignee));
    if (filters.dueBefore) {
      const d = new Date(filters.dueBefore).getTime();
      list = list.filter((t) => t.due_date && new Date(t.due_date).getTime() <= d);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "severity") cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      else if (sortKey === "due_date") {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        cmp = da - db;
      } else {
        const va = String(a[sortKey] ?? "");
        const vb = String(b[sortKey] ?? "");
        cmp = va.localeCompare(vb);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageItems = list.slice(start, start + pageSize);

    return { pageItems, total, totalPages, safePage };
  }, [tasks, filters, sortKey, sortDir, page, pageSize, currentUserId]);
}
