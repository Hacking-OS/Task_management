import type { Severity, SeverityCounts } from "../utils/severity";
import { severityLabel } from "../utils/severity";

interface Props {
  title: string;
  counts: SeverityCounts;
  onSelect: (severity: Severity) => void;
}

export function SeveritySummary({ title, counts, onSelect }: Props) {
  const items: Severity[] = ["critical", "high", "medium", "low"];
  return (
    <section className="severity-summary card">
      <h3>{title}</h3>
      <div className="severity-summary-grid">
        {items.map((s) => (
          <button
            key={s}
            type="button"
            className={`severity-summary-item severity-${s}`}
            onClick={() => onSelect(s)}
          >
            <span>{severityLabel(s)}</span>
            <strong>{counts[s]}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
