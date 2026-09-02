import type { Severity } from "../types.js";
import { assertValid } from "./errors.js";

export const SEVERITIES: readonly Severity[] = [
  "blocker",
  "critical",
  "urgent",
  "high",
  "major",
  "elevated",
  "medium",
  "moderate",
  "low",
  "minor",
  "trivial",
  "cosmetic",
  "enhancement",
  "documentation",
  "informational",
] as const;

export const SEVERITY_LABELS: Record<Severity, string> = {
  blocker: "Blocker",
  critical: "Critical",
  urgent: "Urgent",
  high: "High",
  major: "Major",
  elevated: "Elevated",
  medium: "Medium",
  moderate: "Moderate",
  low: "Low",
  minor: "Minor",
  trivial: "Trivial",
  cosmetic: "Cosmetic",
  enhancement: "Enhancement",
  documentation: "Documentation",
  informational: "Informational",
};

export const SEVERITY_RANK: Record<Severity, number> = {
  blocker: 15,
  critical: 14,
  urgent: 13,
  high: 12,
  major: 11,
  elevated: 10,
  medium: 9,
  moderate: 8,
  low: 7,
  minor: 6,
  trivial: 5,
  cosmetic: 4,
  enhancement: 3,
  documentation: 2,
  informational: 1,
};

const LEGACY_SEVERITY_MAP: Record<string, Severity> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export function normalizeSeverity(value: unknown): Severity | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (SEVERITIES.includes(normalized as Severity)) return normalized as Severity;
  return LEGACY_SEVERITY_MAP[normalized] ?? null;
}

export function parseSeverity(value: unknown, fallback: Severity = "medium"): Severity {
  const parsed = normalizeSeverity(value);
  if (parsed) return parsed;
  if (value === undefined || value === null) return fallback;
  throw new Error(`Invalid severity. Must be one of: ${SEVERITIES.join(", ")}`);
}

export function formatSeverity(value: Severity): string {
  return SEVERITY_LABELS[value];
}

export function shortEntityId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function shouldNotifySeverityChange(oldSeverity: Severity, newSeverity: Severity): boolean {
  if (oldSeverity === newSeverity) return false;
  if (newSeverity === "blocker" || newSeverity === "critical" || newSeverity === "urgent") return true;
  return SEVERITY_RANK[newSeverity] > SEVERITY_RANK[oldSeverity];
}

export function emptySeverityCounts(): Record<Severity, number> {
  return Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
}

export function isHighSeverity(severity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK.high;
}
