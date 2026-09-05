import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import type { MemberManagementSummary } from "../models/types";

interface MemberMembershipPanelProps {
  memberId: string;
  workspaceId: string;
}

export function MemberMembershipPanel({ memberId, workspaceId }: MemberMembershipPanelProps) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<MemberManagementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !memberId || !workspaceId) return;
    setLoading(true);
    setError("");
    api
      .getMemberSummary(token, workspaceId, memberId)
      .then(({ summary: s }) => setSummary(s))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, memberId, workspaceId]);

  if (loading) return <p className="muted">Loading teams and projects…</p>;
  if (error) return <p className="muted">{error}</p>;
  if (!summary) return null;

  return (
    <section className="user-detail-block">
      <h4>Teams &amp; projects — {summary.username}</h4>
      <div className="two-col">
        <div>
          <h5>Teams ({summary.teams.length})</h5>
          {summary.teams.length === 0 ? (
            <p className="muted">Not a member of any team</p>
          ) : (
            <ul className="mini-list">
              {summary.teams.map((t) => (
                <li key={t.id}>
                  <Link to={`/teams/${t.id}`}>{t.name}</Link>
                  {t.is_lead && <span className="badge badge-success">Lead</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h5>Projects ({summary.projects.length})</h5>
          {summary.projects.length === 0 ? (
            <p className="muted">No project access</p>
          ) : (
            <ul className="mini-list">
              {summary.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  {p.role_in_project && <span className="badge">{p.role_in_project}</span>}
                  {p.access_type === "team" && <span className="badge badge-muted">via team</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
