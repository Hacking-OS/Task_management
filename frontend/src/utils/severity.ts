import type { Severity } from "../models/types";

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

export function severityLabel(value: Severity): string {
  return SEVERITY_LABELS[value] ?? value;
}

export function emptySeverityCounts(): Record<Severity, number> {
  return Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
}

export function isHighSeverity(severity: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK.high;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}
