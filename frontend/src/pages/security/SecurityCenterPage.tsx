import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { SecurityEvent } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { ErrorState } from "../../shared/StateBox";

const RISK_OPTIONS = ["", "HIGH", "CRITICAL", "MEDIUM", "LOW", "INFO"] as const;

export function SecurityCenterPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isOwner, securityVersion } = usePermissions();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState("");

  const load = useCallback(async () => {
    if (!token || !activeWorkspace?.id || !isOwner) return;
    setLoading(true);
    setError(null);
    try {
      const { events: list } = await api.getSecurityEvents(token, activeWorkspace.id, {
        risk_level: riskFilter || undefined,
        limit: 100,
      });
      setEvents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load security events");
    } finally {
      setLoading(false);
    }
  }, [token, activeWorkspace?.id, isOwner, riskFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Security Center" subtitle="Workspace security monitoring" />
        <ErrorState message="Only the workspace owner can access the Security Center." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Security Center"
        subtitle={`Monitor authorization events for ${activeWorkspace?.name ?? "workspace"}`}
      />

      <section className="card form-stack">
        <div className="toolbar">
          <label className="field-inline">
            <span>Risk level</span>
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              {RISK_OPTIONS.map((level) => (
                <option key={level || "all"} value={level}>
                  {level || "All levels"}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <p className="text-muted">
          Active security version: <strong>{securityVersion}</strong>
        </p>
      </section>

      {loading ? (
        <p className="text-muted">Loading security events…</p>
      ) : error ? (
        <ErrorState message={error} />
      ) : events.length === 0 ? (
        <section className="card">
          <p className="text-muted">No security events match the current filters.</p>
        </section>
      ) : (
        <section className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Action</th>
                <th>Result</th>
                <th>Risk</th>
                <th>Route</th>
                <th>Reason</th>
                <th>Request ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.timestamp}</td>
                  <td>{event.action}</td>
                  <td>{event.result}</td>
                  <td>{event.risk_level}</td>
                  <td>{event.http_method ?? ""} {event.route ?? ""}</td>
                  <td>{event.reason ?? "—"}</td>
                  <td className="mono">{event.request_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
