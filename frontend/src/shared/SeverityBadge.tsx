import type { Severity } from "../models/types";
import { severityLabel } from "../utils/severity";
import { getSeverityColors } from "../utils/severityColor";

interface Props {
  severity: Severity;
  compact?: boolean;
}

export function SeverityBadge({ severity, compact = false }: Props) {
  const colors = getSeverityColors(severity);

  return (
    <span
      className={`severity-badge${compact ? " severity-badge-compact" : ""}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      <span className="severity-dot" style={{ backgroundColor: colors.solid }} />
      {severityLabel(severity)}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  const colors = getSeverityColors(severity);
  return <span className="severity-dot" style={{ backgroundColor: colors.solid }} title={severityLabel(severity)} />;
}
