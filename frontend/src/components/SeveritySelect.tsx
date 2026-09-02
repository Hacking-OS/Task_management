import type { Severity } from "../utils/severity";
import { SEVERITIES, severityLabel } from "../utils/severity";

interface Props {
  value: Severity;
  onChange: (value: Severity) => void;
  id?: string;
}

export function SeveritySelect({ value, onChange, id }: Props) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as Severity)} className="severity-select">
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>{severityLabel(s)}</option>
      ))}
    </select>
  );
}
