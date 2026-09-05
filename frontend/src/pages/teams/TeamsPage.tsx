import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAsyncSession } from "../../hooks/useAsyncSession";
import { api } from "../../services/api";
import type { ProjectSummary, TeamJoinRequest, TeamJoinStatusInfo, WorkspaceTeam } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { PermissionGate } from "../../shared/PermissionGate";
import {
  ResourceDetailHeader,
  ResourceDetailLoading,
  ResourceNavItem,
  ResourceTabs,
} from "../../shared/ResourceLayout";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { ErrorState, EmptyState } from "../../shared/StateBox";

type TeamTab = "overview" | "requests";

const DEFAULT_JOIN_STATUS: TeamJoinStatusInfo = {
  is_member: false,
  pending: false,
  last_rejected: false,
};

function teamMembers(team: WorkspaceTeam | null) {
  return team?.members ?? [];
}

export function TeamsPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { hasPermission, isOwner, loading: permissionsLoading } = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const { teamId: teamIdParam } = useParams<{ teamId?: string }>();
  // Separate sessions so list reloads cannot cancel detail loads.
  const { begin: beginList, isCurrent: isListCurrent } = useAsyncSession();
  const { begin: beginDetail, isCurrent: isDetailCurrent } = useAsyncSession();

  const wsId = activeWorkspace?.id;
  const selectedTeamIdRef = useRef<string | null>(null);

  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamProjects, setTeamProjects] = useState<ProjectSummary[]>([]);
  const [joinStatus, setJoinStatus] = useState<TeamJoinStatusInfo>(DEFAULT_JOIN_STATUS);
  const [joinRequests, setJoinRequests] = useState<TeamJoinRequest[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TeamTab>("overview");
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  selectedTeamIdRef.current = selectedTeamId;

  const canReviewJoin = hasPermission("team.review_join_request") || hasPermission("team.manage_members") || isOwner;
  const canCreateTeam = hasPermission("team.create") || isOwner;

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );

  const loadTeams = useCallback(async (options?: { initial?: boolean }) => {
    if (!token || !wsId) {
      setTeams([]);
      setSelectedTeamId(null);
      setInitialLoading(false);
      return;
    }

    const isInitial = options?.initial ?? false;
    if (isInitial) setInitialLoading(true);
    setError("");

    const tokenGen = beginList();

    try {
      const { teams: list } = await api.listTeams(token, wsId);
      if (!isListCurrent(tokenGen)) return;

      const normalized = list.map((team) => ({
        ...team,
        members: team.members ?? [],
        member_count: team.member_count ?? team.members?.length ?? 0,
      }));

      setTeams(normalized);

      const fromUrl = teamIdParam ? normalized.find((t) => t.id === teamIdParam) : undefined;
      const currentSelected = selectedTeamIdRef.current;

      if (fromUrl) {
        setSelectedTeamId(fromUrl.id);
      } else if (teamIdParam) {
        setSelectedTeamId(teamIdParam);
      } else if (currentSelected && normalized.some((t) => t.id === currentSelected)) {
        // keep selection
      } else {
        setSelectedTeamId(normalized[0]?.id ?? null);
      }
    } catch (e) {
      if (isListCurrent(tokenGen)) {
        setError(e instanceof Error ? e.message : "Failed to load teams");
        setTeams([]);
        setSelectedTeamId(null);
      }
    } finally {
      if (isListCurrent(tokenGen)) setInitialLoading(false);
    }
  }, [token, wsId, teamIdParam, beginList, isListCurrent]);

  useEffect(() => {
    void loadTeams({ initial: true });
  }, [loadTeams]);

  useEffect(() => {
    if (!selectedTeamId || !token || !wsId) {
      setJoinStatus(DEFAULT_JOIN_STATUS);
      setJoinRequests([]);
      setTeamProjects([]);
      setDetailLoading(false);
      return;
    }

    const tokenGen = beginDetail();
    setDetailLoading(true);

    void (async () => {
      try {
        const tasks: Promise<void>[] = [
          api.getMyTeamJoinStatus(token, wsId, selectedTeamId).then((status) => {
            if (isDetailCurrent(tokenGen)) setJoinStatus(status ?? DEFAULT_JOIN_STATUS);
          }),
          api.listTeamProjects(token, wsId, selectedTeamId).then(({ projects }) => {
            if (isDetailCurrent(tokenGen)) setTeamProjects(projects ?? []);
          }),
        ];

        if (tab === "requests" && canReviewJoin) {
          tasks.push(
            api.listTeamJoinRequests(token, wsId, selectedTeamId, "pending").then(({ requests }) => {
              if (isDetailCurrent(tokenGen)) setJoinRequests(requests ?? []);
            })
          );
        } else if (isDetailCurrent(tokenGen)) {
          setJoinRequests([]);
        }

        await Promise.all(tasks);
      } catch {
        if (isDetailCurrent(tokenGen)) {
          setJoinStatus(DEFAULT_JOIN_STATUS);
          setJoinRequests([]);
          setTeamProjects([]);
        }
      } finally {
        if (isDetailCurrent(tokenGen)) setDetailLoading(false);
      }
    })();
  }, [selectedTeamId, tab, canReviewJoin, token, wsId, beginDetail, isDetailCurrent]);

  const selectTeam = (team: WorkspaceTeam) => {
    if (team.id === selectedTeamId) return;
    setTab("overview");
    setSelectedTeamId(team.id);
    navigate(`/teams/${team.id}`);
  };

  const handleCreateTeam = async () => {
    if (!token || !wsId || !newTeamName.trim()) return;
    setCreating(true);
    try {
      const { team } = await api.createTeam(token, wsId, { name: newTeamName.trim() });
      toast.success("Team created", newTeamName.trim());
      setNewTeamName("");
      setSelectedTeamId(team?.id ?? null);
      if (team?.id) navigate(`/teams/${team.id}`);
      await loadTeams();
    } catch (e) {
      toast.fromError(e, "Could not create team");
    } finally {
      setCreating(false);
    }
  };

  const handleRequestJoin = async (team: WorkspaceTeam) => {
    if (!token || !wsId) return;
    setActionId(team.id);
    try {
      await api.requestTeamJoin(token, wsId, team.id);
      toast.success("Request sent", `Join request submitted for ${team.name}`);
      const status = await api.getMyTeamJoinStatus(token, wsId, team.id);
      setJoinStatus(status ?? DEFAULT_JOIN_STATUS);
    } catch (e) {
      toast.fromError(e, "Could not request to join");
    } finally {
      setActionId(null);
    }
  };

  const handleApproveJoin = async (requestId: string) => {
    if (!token || !wsId || !selectedTeamId) return;
    setActionId(requestId);
    try {
      await api.approveTeamJoinRequest(token, wsId, requestId);
      toast.success("Approved", "Team membership request approved");
      await loadTeams();
      const [{ requests }, status] = await Promise.all([
        api.listTeamJoinRequests(token, wsId, selectedTeamId, "pending"),
        api.getMyTeamJoinStatus(token, wsId, selectedTeamId),
      ]);
      setJoinRequests(requests ?? []);
      setJoinStatus(status ?? DEFAULT_JOIN_STATUS);
    } catch (e) {
      toast.fromError(e, "Could not approve request");
    } finally {
      setActionId(null);
    }
  };

  const handleRejectJoin = async (requestId: string) => {
    if (!token || !wsId || !selectedTeamId) return;
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setActionId(requestId);
    try {
      await api.rejectTeamJoinRequest(token, wsId, requestId, reason);
      toast.warning("Rejected", "Team membership request rejected");
      const { requests } = await api.listTeamJoinRequests(token, wsId, selectedTeamId, "pending");
      setJoinRequests(requests ?? []);
    } catch (e) {
      toast.fromError(e, "Could not reject request");
    } finally {
      setActionId(null);
    }
  };

  const pendingCount = useMemo(
    () => joinRequests.filter((r) => r.status === "pending").length,
    [joinRequests]
  );

  const tabs = useMemo(
    () => [
      { id: "overview" as const, label: "Overview" },
      ...(canReviewJoin ? [{ id: "requests" as const, label: "Join requests", count: pendingCount }] : []),
    ],
    [canReviewJoin, pendingCount]
  );

  const membershipBadge = selectedTeam ? (
    joinStatus.is_member ? (
      <span className="badge badge-success">Member</span>
    ) : joinStatus.pending ? (
      <span className="badge badge-warning">Join pending</span>
    ) : null
  ) : null;

  const joinActions = selectedTeam && !joinStatus.is_member && !joinStatus.pending ? (
    <PermissionGate permission="team.request_join">
      <>
        {joinStatus.last_rejected && (
          <span className="resource-rejected-note">Previous request was rejected</span>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={actionId === selectedTeam.id}
          onClick={() => void handleRequestJoin(selectedTeam)}
        >
          {joinStatus.last_rejected ? "Request again" : "Request to join"}
        </button>
      </>
    </PermissionGate>
  ) : null;

  if (permissionsLoading || initialLoading) {
    return <TablePageSkeleton cols={3} filters={0} />;
  }

  if (!wsId) {
    return (
      <div className="resource-page">
        <PageHeader title="Teams" subtitle="Select a workspace to view teams." />
        <EmptyState message="No active workspace. Choose a workspace first." />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;

  return (
    <div className="resource-page">
      <PageHeader title="Teams" subtitle="Workspace teams, membership, and project assignments." />

      <div className="resource-layout">
        <aside className="resource-sidebar card">
          <div className="resource-sidebar-header">
            <h3 className="card-title">Teams ({teams.length})</h3>
          </div>

          {canCreateTeam && (
            <div className="resource-sidebar-create">
              <input className="input" placeholder="New team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} aria-label="New team name" />
              <button type="button" className="btn btn-primary btn-sm" disabled={creating || !newTeamName.trim()} onClick={() => void handleCreateTeam()}>
                {creating ? "Creating…" : "Create team"}
              </button>
            </div>
          )}

          <div className="resource-sidebar-list">
            {teams.length === 0 ? (
              <EmptyState message={canCreateTeam ? "No teams yet. Create one above." : "No teams in this workspace."} />
            ) : (
              <ul className="resource-nav-list">
                {teams.map((team) => (
                  <ResourceNavItem
                    key={team.id}
                    name={team.name}
                    meta={`${team.member_count ?? 0} members · Lead: ${team.lead_username ?? "Unassigned"}`}
                    active={selectedTeamId === team.id}
                    onClick={() => selectTeam(team)}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="resource-detail card">
          {!selectedTeamId || !selectedTeam ? (
            <div className="resource-detail-empty">
              <EmptyState message="Select a team to view details." />
            </div>
          ) : detailLoading ? (
            <ResourceDetailLoading message="Loading team details…" />
          ) : (
            <>
              <ResourceDetailHeader
                title={selectedTeam.name}
                description={selectedTeam.description || "No description provided."}
                badges={membershipBadge}
                meta={[
                  { label: "Team lead", value: selectedTeam.lead_username ?? "Unassigned" },
                  { label: "Members", value: selectedTeam.member_count ?? teamMembers(selectedTeam).length },
                  { label: "Projects", value: teamProjects.length },
                ]}
                actions={joinActions}
              />

              <ResourceTabs tabs={tabs} active={tab} onChange={setTab} />

              <div className="resource-detail-body">
                {tab === "overview" && (
                  <>
                    <h3 className="resource-section-title">Members</h3>
                    {teamMembers(selectedTeam).length === 0 ? (
                      <p className="muted">No members yet.</p>
                    ) : (
                      <div className="card-table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Member</th>
                              <th>Workspace role</th>
                              <th>Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teamMembers(selectedTeam).map((m) => (
                              <tr key={m.member_id}>
                                <td>
                                  <strong>{m.username}</strong>
                                  <div className="muted">{m.email}</div>
                                </td>
                                <td>{m.role_name}</td>
                                <td className="muted">{new Date(m.joined_at).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <h3 className="resource-section-title resource-section-title-spaced">Assigned projects</h3>
                    {teamProjects.length === 0 ? (
                      <p className="muted">This team is not assigned to any projects.</p>
                    ) : (
                      <ul className="resource-link-list">
                        {teamProjects.map((project) => (
                          <li key={project.id}>
                            <Link to={`/projects/${project.id}`} className="link-primary">{project.name}</Link>
                            <span className="muted">{project.open_task_count} open tasks</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {tab === "requests" && canReviewJoin && (
                  joinRequests.length === 0 ? (
                    <EmptyState message="No pending join requests." />
                  ) : (
                    <div className="card-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Requester</th>
                            <th>Reason</th>
                            <th>Attempt</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {joinRequests.map((req) => (
                            <tr key={req.id}>
                              <td>
                                <strong>{req.requester_username}</strong>
                                <div className="muted">{req.requester_email}</div>
                              </td>
                              <td className="muted">{req.reason || "—"}</td>
                              <td>#{req.attempt_number ?? 1}</td>
                              <td>
                                <div className="resource-table-actions">
                                  <button type="button" className="btn btn-primary btn-sm" disabled={actionId === req.id} onClick={() => void handleApproveJoin(req.id)}>
                                    Approve
                                  </button>
                                  <button type="button" className="btn btn-secondary btn-sm" disabled={actionId === req.id} onClick={() => void handleRejectJoin(req.id)}>
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
