import type { EntityType, FileCategory, Priority } from "../types.js";
import { assertValid } from "./errors.js";

const FILE_CATEGORIES = ["task", "subtask", "issue", "comment", "general"] as const satisfies readonly FileCategory[];

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMENT_ENTITY_TYPES = new Set(["task", "issue", "subtask"]);
const TIMESHEET_ENTITY_TYPES = new Set(["task", "issue", "subtask"]);

export function validateUsername(username: unknown): string {
  assertValid(typeof username === "string", "Username is required");
  const value = username.trim();
  assertValid(value.length >= 3, "Username must be at least 3 characters");
  assertValid(value.length <= 32, "Username must be at most 32 characters");
  assertValid(USERNAME_RE.test(value), "Username may only contain letters, numbers, underscores, and hyphens");
  return value;
}

export function validateEmail(email: unknown): string {
  assertValid(typeof email === "string", "Email is required");
  const value = email.trim().toLowerCase();
  assertValid(value.length <= 254, "Email is too long");
  assertValid(EMAIL_RE.test(value), "Enter a valid email address");
  return value;
}

export function validatePassword(password: unknown): string {
  assertValid(typeof password === "string", "Password is required");
  assertValid(password.length >= 8, "Password must be at least 8 characters");
  assertValid(password.length <= 128, "Password must be at most 128 characters");
  assertValid(/[A-Za-z]/.test(password) && /\d/.test(password), "Password must include at least one letter and one number");
  return password;
}

export function validateLoginIdentifier(identifier: unknown): string {
  assertValid(typeof identifier === "string", "Username or email is required");
  const value = identifier.trim();
  assertValid(value.length > 0, "Username or email is required");
  return value;
}

export function validateTitle(title: unknown, label = "Title"): string {
  assertValid(typeof title === "string", `${label} is required`);
  const value = title.trim();
  assertValid(value.length > 0, `${label} cannot be empty`);
  assertValid(value.length <= 200, `${label} must be at most 200 characters`);
  return value;
}

export function validateDescription(description: unknown, max = 10000): string {
  if (description === undefined || description === null) return "";
  assertValid(typeof description === "string", "Description must be text");
  assertValid(description.length <= max, `Description must be at most ${max} characters`);
  return description.trim();
}

export function validateWorkspaceName(name: unknown): string {
  assertValid(typeof name === "string", "Workspace name is required");
  const value = name.trim();
  assertValid(value.length >= 2, "Workspace name must be at least 2 characters");
  assertValid(value.length <= 100, "Workspace name must be at most 100 characters");
  return value;
}

export function validateCommentBody(body: unknown): string {
  assertValid(typeof body === "string", "Comment is required");
  const value = body.trim();
  assertValid(value.length > 0, "Comment cannot be empty");
  assertValid(value.length <= 5000, "Comment must be at most 5000 characters");
  return value;
}

export function validateCommentEntityType(entityType: unknown): EntityType {
  assertValid(typeof entityType === "string", "Entity type is required");
  assertValid(COMMENT_ENTITY_TYPES.has(entityType), "Comments are only allowed on tasks, issues, and subtasks");
  return entityType as EntityType;
}

export function validateFileCategory(category: unknown): FileCategory {
  assertValid(typeof category === "string", "File category is required");
  assertValid(FILE_CATEGORIES.includes(category as FileCategory), `Invalid file category. Must be one of: ${FILE_CATEGORIES.join(", ")}`);
  return category as FileCategory;
}

export function validateEntityId(entityId: unknown, label = "Entity"): string {
  assertValid(typeof entityId === "string", `${label} id is required`);
  const value = entityId.trim();
  assertValid(value.length > 0, `${label} id is required`);
  return value;
}

export function validatePriority(value: unknown, fallback: Priority = "medium"): Priority {
  if (value === undefined || value === null) return fallback;
  assertValid(typeof value === "string", "Priority must be a string");
  const normalized = value.toLowerCase() as Priority;
  assertValid(["low", "medium", "high"].includes(normalized), "Priority must be low, medium, or high");
  return normalized;
}

export function validateHours(hours: unknown): number {
  assertValid(typeof hours === "number" || typeof hours === "string", "Hours is required");
  const value = typeof hours === "number" ? hours : Number(hours);
  assertValid(Number.isFinite(value), "Hours must be a valid number");
  assertValid(value > 0, "Hours must be greater than 0");
  assertValid(value <= 24, "Hours cannot exceed 24 per entry");
  return Math.round(value * 100) / 100;
}

export function validateWorkDate(date: unknown): string {
  assertValid(typeof date === "string", "Work date is required");
  const value = date.trim();
  assertValid(/^\d{4}-\d{2}-\d{2}$/.test(value), "Work date must be YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00`);
  assertValid(!Number.isNaN(parsed.getTime()), "Work date is invalid");
  return value;
}

export function validateTimesheetEntityType(entityType: unknown): "task" | "issue" | "subtask" {
  assertValid(typeof entityType === "string", "Entity type is required");
  assertValid(TIMESHEET_ENTITY_TYPES.has(entityType), "Timesheets can only be logged against tasks, issues, or subtasks");
  return entityType as "task" | "issue" | "subtask";
}

export function validateFilename(filename: unknown): string {
  assertValid(typeof filename === "string", "Filename is required");
  const value = filename.trim();
  assertValid(value.length > 0, "Filename is required");
  assertValid(value.length <= 255, "Filename is too long");
  return value;
}
