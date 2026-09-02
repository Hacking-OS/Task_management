import type { SeverityFilter } from "../utils/severity";
import { SEVERITIES, severityLabel } from "../utils/severity";

interface Props {
  value: SeverityFilter;
  onChange: (value: SeverityFilter) => void;
}

const OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...SEVERITIES.map((s) => ({ value: s as SeverityFilter, label: severityLabel(s) })),
];

export function SeverityFilterBar({ value, onChange }: Props) {
  return (
    <div className="severity-filter-bar">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`severity-filter-btn ${value === opt.value ? "active" : ""}${opt.value !== "all" ? ` severity-${opt.value}` : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
