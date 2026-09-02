import type { Severity } from "../models/types";
import { SEVERITIES, severityLabel } from "../utils/severity";
import { getSeverityColors } from "../utils/severityColor";
import { SeverityDot } from "./SeverityBadge";

interface Props {
  value: Severity | "all";
  onChange: (value: Severity | "all") => void;
  id?: string;
  includeAll?: boolean;
  allLabel?: string;
  className?: string;
}

export function SeveritySelect({
  value,
  onChange,
  id,
  includeAll,
  allLabel = "All severities",
  className = "select",
}: Props) {
  const preview = value !== "all" ? getSeverityColors(value as Severity) : null;

  return (
    <div className="colored-select-wrap">
      {preview && <SeverityDot severity={value as Severity} />}
      <select
        id={id}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value as Severity | "all")}
      >
        {includeAll && <option value="all">{allLabel}</option>}
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>{severityLabel(s)}</option>
        ))}
      </select>
    </div>
  );
}
