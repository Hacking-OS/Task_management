import type { Severity } from "../utils/severity";
import { severityLabel } from "../utils/severity";

interface Props {
  severity: Severity;
  compact?: boolean;
}

export function SeverityBadge({ severity, compact = false }: Props) {
  return (
    <span className={`severity-badge severity-${severity}${compact ? " compact" : ""}`}>
      {severityLabel(severity)}
    </span>
  );
}
