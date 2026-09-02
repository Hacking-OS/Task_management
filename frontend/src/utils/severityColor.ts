import type { Severity } from "../models/types";
import { SEVERITIES } from "./severity";

export interface SeverityColorSet {
  solid: string;
  bg: string;
  text: string;
  border: string;
}

const SOLIDS = [
  "#7f1d1d", "#b91c1c", "#dc2626", "#c2410c", "#ea580c",
  "#d97706", "#2563eb", "#0284c7", "#15803d", "#16a34a",
  "#059669", "#0d9488", "#6366f1", "#64748b", "#94a3b8",
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildColor(solid: string): SeverityColorSet {
  return {
    solid,
    bg: mix(solid, 0.08),
    text: solid,
    border: mix(solid, 0.25),
  };
}

export const SEVERITY_COLORS = Object.fromEntries(
  SEVERITIES.map((s, i) => [s, buildColor(SOLIDS[i] ?? SOLIDS[SOLIDS.length - 1])])
) as Record<Severity, SeverityColorSet>;

export function getSeverityColors(severity: Severity): SeverityColorSet {
  return SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.medium;
}
