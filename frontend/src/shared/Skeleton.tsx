interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`skeleton${className ? ` ${className}` : ""}`} style={style} aria-hidden />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="page-header skeleton-header">
      <div>
        <Skeleton className="sk-title" />
        <Skeleton className="sk-subtitle" />
      </div>
      <Skeleton className="sk-btn" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="stat-card">
          <Skeleton className="sk-stat-label" />
          <Skeleton className="sk-stat-value" />
          <Skeleton className="sk-stat-link" />
        </div>
      ))}
    </div>
  );
}

export function FiltersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="filters-bar card skeleton-filters">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="sk-filter" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-table-wrap">
      <table className="data-table skeleton-table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}><Skeleton className="sk-th" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}><Skeleton className={`sk-td${c === 0 ? " sk-td-wide" : ""}`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablePageSkeleton({ cols = 6, filters = 5 }: { cols?: number; filters?: number }) {
  return (
    <div className="skeleton-page">
      <PageHeaderSkeleton />
      <FiltersSkeleton count={filters} />
      <TableSkeleton cols={cols} />
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="skeleton-page">
      <PageHeaderSkeleton />
      <div className="detail-grid">
        {Array.from({ length: 3 }, (_, i) => (
          <section key={i} className="card">
            <Skeleton className="sk-card-title" />
            {Array.from({ length: 5 }, (_, j) => (
              <Skeleton key={j} className="sk-detail-row" />
            ))}
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <Skeleton className="sk-card-title" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="sk-timeline-row" />
        ))}
      </section>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="skeleton-page">
      <PageHeaderSkeleton />
      <section className="card form-stack">
        <Skeleton className="sk-form-label" />
        <Skeleton className="sk-input" />
        <Skeleton className="sk-form-label" />
        <Skeleton className="sk-textarea" />
        <div className="form-row">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="sk-input" />
          ))}
        </div>
        <div className="form-actions">
          <Skeleton className="sk-btn" />
          <Skeleton className="sk-btn sk-btn-primary" />
        </div>
      </section>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="skeleton-page">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={4} />
      <div className="charts-row charts-row-2">
        <section className="card"><Skeleton className="sk-chart" /></section>
        <section className="card"><Skeleton className="sk-chart" /></section>
      </div>
      <section className="card"><Skeleton className="sk-chart sk-chart-wide" /></section>
    </div>
  );
}

export function CardListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <section className="card">
      <Skeleton className="sk-card-title" />
      <ul className="mini-list">
        {Array.from({ length: items }, (_, i) => (
          <li key={i}><Skeleton className="sk-list-row" /></li>
        ))}
      </ul>
    </section>
  );
}

export function AppLoadingSkeleton() {
  return (
    <div className="app-loading-skeleton">
      <Skeleton className="sk-app-sidebar" />
      <div className="sk-app-main">
        <Skeleton className="sk-app-header" />
        <TablePageSkeleton />
      </div>
    </div>
  );
}
