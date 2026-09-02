import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardStats, Severity, StatusCount } from "../models/types";
import { SEVERITIES, severityLabel } from "../utils/severity";
import { SEVERITY_COLORS } from "../utils/severityColor";

const ENTITY_COLORS = {
  tasks: "#2563eb",
  issues: "#d97706",
  subtasks: "#7c3aed",
};

const STATUS_FALLBACK = ["#64748b", "#2563eb", "#d97706", "#059669", "#475569", "#9333ea"];

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityPieData(counts: Record<Severity, number>) {
  return SEVERITIES.map((s) => ({
    name: severityLabel(s),
    value: counts[s],
    key: s,
  })).filter((d) => d.value > 0);
}

function severityBarData(stats: DashboardStats["severity"]) {
  return SEVERITIES.map((s) => ({
    severity: severityLabel(s),
    key: s,
    Tasks: stats.tasks[s],
    Issues: stats.issues[s],
    Subtasks: stats.subtasks[s],
  }));
}

function statusBarData(items: StatusCount[], statusColors?: Map<string, string>) {
  return items.map((item, i) => ({
    name: formatStatus(item.status),
    count: item.count,
    fill: statusColors?.get(item.status) ?? STATUS_FALLBACK[i % STATUS_FALLBACK.length],
  }));
}

function ChartEmpty({ message }: { message: string }) {
  return <p className="chart-empty muted">{message}</p>;
}

function PiePanel({
  title,
  data,
  colorMap,
}: {
  title: string;
  data: { name: string; value: number; key?: string }[];
  colorMap?: Record<string, string>;
}) {
  if (data.length === 0) return (
    <div className="chart-panel chart-panel-sm">
      <h4>{title}</h4>
      <ChartEmpty message="No data" />
    </div>
  );

  return (
    <div className="chart-panel chart-panel-sm">
      <h4>{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={72}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={entry.key && colorMap ? colorMap[entry.key as Severity] : STATUS_FALLBACK[data.indexOf(entry) % STATUS_FALLBACK.length]}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [Number(value ?? 0), "Count"]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DashboardChartsProps {
  stats: DashboardStats;
  statusColors?: {
    task?: Map<string, string>;
    issue?: Map<string, string>;
    subtask?: Map<string, string>;
  };
}

export function DashboardCharts({ stats, statusColors }: DashboardChartsProps) {
  const severityBars = severityBarData(stats.severity);

  const totalsData = [
    { name: "Tasks", count: stats.totals.tasks, fill: ENTITY_COLORS.tasks },
    { name: "Issues", count: stats.totals.issues, fill: ENTITY_COLORS.issues },
    { name: "Subtasks", count: stats.totals.subtasks, fill: ENTITY_COLORS.subtasks },
  ];

  const taskStatusData = statusBarData(stats.byStatus.tasks, statusColors?.task);
  const issueStatusData = statusBarData(stats.byStatus.issues, statusColors?.issue);
  const subtaskStatusData = statusBarData(stats.byStatus.subtasks, statusColors?.subtask);

  const hasAnyData = stats.totals.tasks + stats.totals.issues + stats.totals.subtasks > 0;

  if (!hasAnyData) {
    return (
      <section className="card">
        <h3 className="card-title">Analytics</h3>
        <ChartEmpty message="No work items yet. Create tasks or issues to see charts." />
      </section>
    );
  }

  return (
    <div className="dashboard-charts">
      <div className="charts-row charts-row-2">
        <CompletionPanel stats={stats.completion} />
        <section className="card chart-panel">
          <h3 className="card-title">Work items overview</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={totalsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {totalsData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card chart-panel">
        <h3 className="card-title">Severity by type</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={severityBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="severity" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Tasks" fill={ENTITY_COLORS.tasks} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Issues" fill={ENTITY_COLORS.issues} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Subtasks" fill={ENTITY_COLORS.subtasks} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="charts-row charts-row-3">
        <PiePanel
          title="Tasks by severity"
          data={severityPieData(stats.severity.tasks)}
          colorMap={Object.fromEntries(SEVERITIES.map((s) => [s, SEVERITY_COLORS[s].solid]))}
        />
        <PiePanel
          title="Issues by severity"
          data={severityPieData(stats.severity.issues)}
          colorMap={Object.fromEntries(SEVERITIES.map((s) => [s, SEVERITY_COLORS[s].solid]))}
        />
        <PiePanel
          title="Subtasks by severity"
          data={severityPieData(stats.severity.subtasks)}
          colorMap={Object.fromEntries(SEVERITIES.map((s) => [s, SEVERITY_COLORS[s].solid]))}
        />
      </div>

      <div className="charts-row charts-row-3">
        <StatusBarPanel title="Tasks by status" data={taskStatusData} />
        <StatusBarPanel title="Issues by status" data={issueStatusData} />
        <StatusBarPanel title="Subtasks by status" data={subtaskStatusData} />
      </div>
    </div>
  );
}

function CompletionPanel({ stats }: { stats: DashboardStats["completion"] }) {
  const rows = [
    { label: "Overall", data: stats.overall, accent: "#2563eb" },
    { label: "Tasks", data: stats.tasks, accent: ENTITY_COLORS.tasks },
    { label: "Issues", data: stats.issues, accent: ENTITY_COLORS.issues },
    { label: "Subtasks", data: stats.subtasks, accent: ENTITY_COLORS.subtasks },
  ];

  return (
    <section className="card chart-panel completion-panel">
      <h3 className="card-title">Completion progress</h3>
      <div className="completion-grid">
        {rows.map((row) => (
          <div key={row.label} className="completion-row">
            <div className="completion-row-head">
              <span>{row.label}</span>
              <strong>{row.data.percent}%</strong>
            </div>
            <div className="completion-bar-track">
              <div className="completion-bar-fill" style={{ width: `${row.data.percent}%`, backgroundColor: row.accent }} />
            </div>
            <span className="muted completion-meta">{row.data.closed} of {row.data.total} closed</span>
          </div>
        ))}
      </div>
      {stats.taskSubtaskProgress.tasksWithSubtasks > 0 && (
        <p className="muted completion-subtask-note">
          Avg subtask completion on {stats.taskSubtaskProgress.tasksWithSubtasks} tasks: {stats.taskSubtaskProgress.avgSubtaskPercent}%
          ({stats.taskSubtaskProgress.closedSubtasks}/{stats.taskSubtaskProgress.totalSubtasks} subtasks)
        </p>
      )}
    </section>
  );
}

function StatusBarPanel({
  title,
  data,
}: {
  title: string;
  data: { name: string; count: number; fill: string }[];
}) {
  return (
    <section className="card chart-panel chart-panel-sm">
      <h3 className="card-title">{title}</h3>
      {data.length === 0 ? (
        <ChartEmpty message="No data" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
