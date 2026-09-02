export type FormErrors<T extends string = string> = Partial<Record<T, string>>;

export function hasFormErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function firstFormError(errors: FormErrors): string | null {
  for (const message of Object.values(errors)) {
    if (message) return message;
  }
  return null;
}

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (value.length < 3) return "Username must be at least 3 characters";
  if (value.length > 32) return "Username must be at most 32 characters";
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return "Username may only contain letters, numbers, underscores, and hyphens";
  return null;
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address";
  return null;
}

export function validatePassword(password: string, forRegister = false): string | null {
  if (!password) return "Password is required";
  if (forRegister) {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must include at least one letter and one number";
  }
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return null;
}

export function validateLoginIdentifier(identifier: string): string | null {
  if (!identifier.trim()) return "Username or email is required";
  return null;
}

export function validateTitle(title: string, label = "Title"): string | null {
  const value = title.trim();
  if (!value) return `${label} is required`;
  if (value.length < 2) return `${label} must be at least 2 characters`;
  if (value.length > 200) return `${label} must be at most 200 characters`;
  return null;
}

export function validateDescription(description: string, optional = true): string | null {
  const value = description.trim();
  if (!value && optional) return null;
  if (!value) return "Description is required";
  if (value.length > 10000) return "Description must be at most 10,000 characters";
  return null;
}

export function validateDueDate(date: string, optional = true): string | null {
  if (!date) return optional ? null : "Due date is required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Enter a valid due date";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Enter a valid due date";
  return null;
}

export function validateCommentBody(body: string): string | null {
  const value = body.trim();
  if (!value) return "Comment cannot be empty";
  if (value.length > 5000) return "Comment must be at most 5,000 characters";
  return null;
}

export function validateHours(hours: string): string | null {
  const raw = hours.trim();
  if (!raw) return "Hours are required";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "Enter a valid number with up to 2 decimal places";
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "Enter hours greater than 0";
  if (value > 24) return "Hours cannot exceed 24 per entry";
  return null;
}

export function validateWorkDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Enter a valid date";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Enter a valid date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) return "Work date cannot be in the future";
  return null;
}

export function validateRequiredSelection(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  return null;
}

export function validateWorkspaceName(name: string): string | null {
  const value = name.trim();
  if (!value) return "Workspace name is required";
  if (value.length < 2) return "Workspace name must be at least 2 characters";
  if (value.length > 80) return "Workspace name must be at most 80 characters";
  return null;
}

export function validateSubtaskParent(taskId: string, issueId: string): string | null {
  if (taskId.trim() || issueId.trim()) return null;
  return "Select a parent task or issue";
}

export function validateTimesheetDescription(description: string): string | null {
  if (description.length > 500) return "Description must be at most 500 characters";
  return null;
}

export type TaskFormValues = {
  title: string;
  description: string;
  dueDate: string;
  workspaceRequired?: boolean;
  hasWorkspace?: boolean;
};

export function validateTaskForm(values: TaskFormValues): FormErrors<"title" | "description" | "dueDate" | "workspace"> {
  const errors: FormErrors<"title" | "description" | "dueDate" | "workspace"> = {};
  const titleErr = validateTitle(values.title);
  const descErr = validateDescription(values.description);
  const dueErr = validateDueDate(values.dueDate);
  if (titleErr) errors.title = titleErr;
  if (descErr) errors.description = descErr;
  if (dueErr) errors.dueDate = dueErr;
  if (values.workspaceRequired && !values.hasWorkspace) {
    errors.workspace = "Select a workspace before creating a task";
  }
  return errors;
}

export type IssueFormValues = {
  title: string;
  description: string;
  hasWorkspace?: boolean;
};

export function validateIssueForm(values: IssueFormValues): FormErrors<"title" | "description" | "workspace"> {
  const errors: FormErrors<"title" | "description" | "workspace"> = {};
  const titleErr = validateTitle(values.title);
  const descErr = validateDescription(values.description);
  if (titleErr) errors.title = titleErr;
  if (descErr) errors.description = descErr;
  if (!values.hasWorkspace) errors.workspace = "Select a workspace before creating an issue";
  return errors;
}

export type SubtaskFormValues = {
  title: string;
  taskId: string;
  issueId: string;
};

export function validateSubtaskForm(values: SubtaskFormValues): FormErrors<"title" | "parent"> {
  const errors: FormErrors<"title" | "parent"> = {};
  const titleErr = validateTitle(values.title, "Subtask title");
  const parentErr = validateSubtaskParent(values.taskId, values.issueId);
  if (titleErr) errors.title = titleErr;
  if (parentErr) errors.parent = parentErr;
  return errors;
}

export type TimesheetFormValues = {
  entityId: string;
  workDate: string;
  hours: string;
  description: string;
};

export function validateTimesheetForm(values: TimesheetFormValues): FormErrors<"entityId" | "workDate" | "hours" | "description"> {
  const errors: FormErrors<"entityId" | "workDate" | "hours" | "description"> = {};
  const entityErr = validateRequiredSelection(values.entityId, "Work item");
  const dateErr = validateWorkDate(values.workDate);
  const hoursErr = validateHours(values.hours);
  const descErr = validateTimesheetDescription(values.description);
  if (entityErr) errors.entityId = entityErr;
  if (dateErr) errors.workDate = dateErr;
  if (hoursErr) errors.hours = hoursErr;
  if (descErr) errors.description = descErr;
  return errors;
}

export type WorkspaceFormValues = {
  name: string;
  description: string;
};

export function validateWorkspaceForm(values: WorkspaceFormValues): FormErrors<"name" | "description"> {
  const errors: FormErrors<"name" | "description"> = {};
  const nameErr = validateWorkspaceName(values.name);
  const descErr = validateDescription(values.description);
  if (nameErr) errors.name = nameErr;
  if (descErr) errors.description = descErr;
  return errors;
}
