import type { WorkEntityType } from "../../utils/entityColors";
import { ENTITY_TYPE_LABELS, entityTypeColors } from "../../utils/entityColors";

interface EntityTypeBadgeProps {
  type: WorkEntityType;
  compact?: boolean;
}

function EntityTypeBadge({ type, compact }: EntityTypeBadgeProps) {
  const colors = entityTypeColors(type);
  return (
    <span
      className={`entity-type-badge entity-type-badge--${type}${compact ? " entity-type-badge-compact" : ""}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      <span className="entity-type-dot" style={{ backgroundColor: colors.solid }} aria-hidden />
      {ENTITY_TYPE_LABELS[type]}
    </span>
  );
}

interface EntityTypePickerProps {
  value: WorkEntityType;
  onChange: (type: WorkEntityType) => void;
  disabled?: boolean;
}

/** Colored type selector for forms (task / issue / subtask). */
function EntityTypePicker({ value, onChange, disabled }: EntityTypePickerProps) {
  const types: WorkEntityType[] = ["task", "issue", "subtask"];

  return (
    <div className="entity-type-picker" role="radiogroup" aria-label="Work item type">
      {types.map((type) => {
        const colors = entityTypeColors(type);
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`entity-type-option entity-type-option--${type}${active ? " active" : ""}`}
            style={
              active
                ? {
                    backgroundColor: colors.bg,
                    color: colors.text,
                    borderColor: colors.solid,
                    boxShadow: `inset 0 0 0 1px ${colors.solid}`,
                  }
                : undefined
            }
            onClick={() => onChange(type)}
          >
            <span className="entity-type-dot" style={{ backgroundColor: colors.solid }} aria-hidden />
            {ENTITY_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

export { EntityTypeBadge, EntityTypePicker };
