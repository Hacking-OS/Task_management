import { memo, type ReactNode } from "react";

interface ResourceMetaItem {
  label: string;
  value: ReactNode;
}

interface ResourceDetailHeaderProps {
  title: string;
  description?: string;
  meta?: ResourceMetaItem[];
  actions?: ReactNode;
  badges?: ReactNode;
}

export const ResourceDetailHeader = memo(function ResourceDetailHeader({
  title,
  description,
  meta,
  actions,
  badges,
}: ResourceDetailHeaderProps) {
  return (
    <header className="resource-detail-header">
      <div className="resource-detail-intro">
        <div className="resource-detail-title-row">
          <h2 className="resource-detail-title">{title}</h2>
          {badges}
        </div>
        {description ? <p className="resource-detail-desc">{description}</p> : null}
        {meta && meta.length > 0 ? (
          <dl className="resource-meta-row">
            {meta.map((item) => (
              <div key={item.label} className="resource-meta-item">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {actions ? <div className="resource-detail-actions">{actions}</div> : null}
    </header>
  );
});

interface ResourceNavItemProps {
  name: string;
  meta: string;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
}

export const ResourceNavItem = memo(function ResourceNavItem({
  name,
  meta,
  active,
  onClick,
  badge,
}: ResourceNavItemProps) {
  return (
    <li>
      <button type="button" className={`resource-nav-item${active ? " active" : ""}`} onClick={onClick}>
        <span className="resource-nav-item-main">
          <span className="resource-nav-item-name">{name}</span>
          {badge}
        </span>
        <span className="resource-nav-item-meta">{meta}</span>
      </button>
    </li>
  );
});

interface ResourceTabsProps<T extends string> {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (tab: T) => void;
}

export function ResourceTabs<T extends string>({ tabs, active, onChange }: ResourceTabsProps<T>) {
  return (
    <div className="resource-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`resource-tab${active === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 ? <span className="resource-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ResourceDetailLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="resource-detail-empty" aria-busy="true">
      <p className="muted">{message}</p>
    </div>
  );
}
