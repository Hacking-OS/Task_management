import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useMembers } from "../../context/MembersContext";
import { usePermissions } from "../../context/PermissionsContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAsyncSession } from "../../hooks/useAsyncSession";
import { api } from "../../services/api";
import type { ProjectSummary, ProjectWithDetails, WorkspaceTeam } from "../../models/types";
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

type ProjectTab = "overview" | "teams" | "members";
type StatusFilter = "all" | "active" | "archived";

export function ProjectsPage() {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { members } = useMembers();
  const { hasPermission, isOwner } = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const { projectId: projectIdParam } = useParams<{ projectId?: string }>();
  // Separate sessions so list reloads (URL/filter changes) cannot cancel detail loads.
  const { begin: beginList, isCurrent: isListCurrent } = useAsyncSession();
  const { begin: beginDetail, isCurrent: isDetailCurrent } = useAsyncSession();

  const wsId = activeWorkspace?.id;
  const selectedProjectIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectWithDetails | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [addMemberId, setAddMemberId] = useState("");

  selectedProjectIdRef.current = selectedProjectId;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const canCreate = hasPermission("project.create") || isOwner;
  const canManage = hasPermission("project.update") || isOwner;
  const canManageMembers = hasPermission("project.manage_members") || isOwner;
  const canAssignTeams = hasPermission("project.assign_teams") || isOwner;
  const canDelete = hasPermission("project.delete") || isOwner;

  const loadProjects = useCallback(async (options?: { initial?: boolean }) => {
    if (!token || !wsId) {
      setProjects([]);
      setSelectedProjectId(null);
      setInitialLoading(false);
      setListLoading(false);
      return;
    }

    const isInitial = options?.initial ?? false;
    if (isInitial) setInitialLoading(true);
    else setListLoading(true);
    setError("");

    const tokenGen = beginList();

    try {
      const filters: { status?: "active" | "archived"; search?: string } = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (searchQuery) filters.search = searchQuery;

      const [{ projects: list }, { teams: teamList }] = await Promise.all([
        api.listProjects(token, wsId, filters),
        api.listTeams(token, wsId).catch(() => ({ teams: [] as WorkspaceTeam[] })),
      ]);

      if (!isListCurrent(tokenGen)) return;

      setProjects(list);
      setTeams(teamList);

      const fromUrl = projectIdParam ? list.find((p) => p.id === projectIdParam) : undefined;
      const currentSelected = selectedProjectIdRef.current;

      if (fromUrl) {
        setSelectedProjectId(fromUrl.id);
      } else if (projectIdParam) {
        // Keep URL selection even when filters hide the project from the sidebar list.
        setSelectedProjectId(projectIdParam);
      } else if (currentSelected && list.some((p) => p.id === currentSelected)) {
        // keep current selection
      } else {
        setSelectedProjectId(list[0]?.id ?? null);
      }
    } catch (e) {
      if (isListCurrent(tokenGen)) setError((e as Error).message);
    } finally {
      if (isListCurrent(tokenGen)) {
        setInitialLoading(false);
        setListLoading(false);
      }
    }
  }, [token, wsId, statusFilter, searchQuery, projectIdParam, beginList, isListCurrent]);

  useEffect(() => {
    void loadProjects({ initial: !hasLoadedRef.current });
    hasLoadedRef.current = true;
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId || !token || !wsId) {
      setProjectDetail(null);
      setDetailLoading(false);
      return;
    }

    const tokenGen = beginDetail();
    const loadingId = selectedProjectId;
    setDetailLoading(true);

    void (async () => {
      try {
        const { project } = await api.getProject(token, wsId, loadingId);
        if (!isDetailCurrent(tokenGen)) return;
        setProjectDetail(project);
        setSelectedTeamIds(project.teams.map((t) => t.team_id));
      } catch (e) {
        if (!isDetailCurrent(tokenGen)) return;
        setProjectDetail(null);
        toast.fromError(e, "Could not load project details");
      } finally {
        if (isDetailCurrent(tokenGen)) setDetailLoading(false);
      }
    })();
  }, [selectedProjectId, token, wsId, beginDetail, isDetailCurrent, toast]);

  const handleSelectProject = (id: string) => {
    if (id === selectedProjectId) return;
    setTab("overview");
    setProjectDetail(null);
    setSelectedTeamIds([]);
    setSelectedProjectId(id);
    navigate(`/projects/${id}`);
  };

  const handleCreate = async () => {
    if (!token || !wsId || !newProjectName.trim()) return;
    setCreating(true);
    try {
      const { project } = await api.createProject(token, wsId, {
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
      });
      setNewProjectName("");
      setNewProjectDesc("");
      setSelectedProjectId(project.id);
      navigate(`/projects/${project.id}`);
      await loadProjects();
      toast.success("Project created", project.name);
    } catch (e) {
      toast.fromError(e, "Could not create project");
    } finally {
      setCreating(false);
    }
  };

  const refreshDetail = async () => {
    if (!token || !wsId || !selectedProjectId) return;
    const tokenGen = beginDetail();
    try {
      const { project } = await api.getProject(token, wsId, selectedProjectId);
      if (!isDetailCurrent(tokenGen)) return;
      setProjectDetail(project);
      setSelectedTeamIds(project.teams.map((t) => t.team_id));
      await loadProjects();
    } catch (e) {
      toast.fromError(e, "Could not refresh project");
    }
  };

  const handleArchive = async () => {
    if (!token || !wsId || !selectedProjectId) return;
    setActionId("archive");
    try {
      await api.updateProject(token, wsId, selectedProjectId, { status: "archived" });
      await refreshDetail();
      toast.success("Project archived");
    } catch (e) {
      toast.fromError(e, "Could not archive project");
    } finally {
      setActionId(null);
    }
  };

  const handleRestore = async () => {
    if (!token || !wsId || !selectedProjectId) return;
    setActionId("restore");
    try {
      await api.updateProject(token, wsId, selectedProjectId, { status: "active" });
      await refreshDetail();
      toast.success("Project restored");
    } catch (e) {
      toast.fromError(e, "Could not restore project");
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!token || !wsId || !selectedProjectId || !projectDetail) return;
    if (!window.confirm(`Delete project "${projectDetail.name}"? This cannot be undone.`)) return;
    setActionId("delete");
    try {
      await api.deleteProject(token, wsId, selectedProjectId);
      toast.success("Project deleted");
      setSelectedProjectId(null);
      setProjectDetail(null);
      navigate("/projects");
      await loadProjects();
    } catch (e) {
      toast.fromError(e, "Could not delete project");
    } finally {
      setActionId(null);
    }
  };

  const handleSaveTeams = async () => {
    if (!token || !wsId || !selectedProjectId || detailLoading) return;
    if (projectDetail && projectDetail.id !== selectedProjectId) return;
    setActionId("teams");
    try {
      await api.setProjectTeams(token, wsId, selectedProjectId, selectedTeamIds);
      await refreshDetail();
      toast.success("Teams updated");
    } catch (e) {
      toast.fromError(e, "Could not update teams");
    } finally {
      setActionId(null);
    }
  };

  const handleAddMember = async () => {
    if (!token || !wsId || !selectedProjectId || !addMemberId) return;
    setActionId("add-member");
    try {
      await api.addProjectMember(token, wsId, selectedProjectId, { member_id: addMemberId });
      setAddMemberId("");
      await refreshDetail();
      toast.success("Member added");
    } catch (e) {
      toast.fromError(e, "Could not add member");
    } finally {
      setActionId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!token || !wsId || !selectedProjectId) return;
    setActionId(memberId);
    try {
      await api.removeProjectMember(token, wsId, selectedProjectId, memberId);
      await refreshDetail();
      toast.success("Member removed");
    } catch (e) {
      toast.fromError(e, "Could not remove member");
    } finally {
      setActionId(null);
    }
  };

  const handleSetLead = async (memberId: string) => {
    if (!token || !wsId || !selectedProjectId) return;
    setActionId(`lead-${memberId}`);
    try {
      await api.setProjectLead(token, wsId, selectedProjectId, memberId);
      await refreshDetail();
      toast.success("Project lead updated");
    } catch (e) {
      toast.fromError(e, "Could not change project lead");
    } finally {
      setActionId(null);
    }
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const availableMembers = useMemo(() => {
    const existing = new Set(projectDetail?.members.map((m) => m.member_id) ?? []);
    return members.filter((m) => !existing.has(m.id) && m.role_slug !== "owner");
  }, [members, projectDetail]);

  const tabs = useMemo(
    () => [
      { id: "overview" as const, label: "Overview" },
      { id: "teams" as const, label: "Teams", count: projectDetail?.team_count },
      { id: "members" as const, label: "Members", count: projectDetail?.member_count },
    ],
    [projectDetail?.team_count, projectDetail?.member_count]
  );

  if (initialLoading) return <TablePageSkeleton cols={4} filters={2} />;
  if (error && projects.length === 0) return <ErrorState message={error} />;

  const detailActions = projectDetail ? (
    <>
      {projectDetail.status === "active"
        ? canManage && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={actionId === "archive"} onClick={handleArchive}>
              Archive
            </button>
          )
        : canManage && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={actionId === "restore"} onClick={handleRestore}>
              Restore
            </button>
          )}
      {canDelete && (
        <button type="button" className="btn btn-danger btn-sm" disabled={actionId === "delete"} onClick={handleDelete}>
          Delete
        </button>
      )}
    </>
  ) : null;

  const showDetail = selectedProjectId && projectDetail;

  return (
    <div className="resource-page">
      <PageHeader title="Projects" subtitle="Manage projects, team assignments, and direct membership." />

      <div className="resource-layout">
        <aside className="resource-sidebar card" aria-busy={listLoading}>
          <div className="resource-sidebar-header">
            <h3 className="card-title">Projects ({projects.length})</h3>
          </div>

          <div className="resource-sidebar-toolbar">
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter by status"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
            <input
              type="search"
              className="input"
              placeholder="Search projects"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search projects"
            />
          </div>

          <PermissionGate permission="project.create">
            <div className="resource-sidebar-create">
              <input className="input" placeholder="Project name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
              <input className="input" placeholder="Description (optional)" value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" disabled={creating || !newProjectName.trim() || !canCreate} onClick={handleCreate}>
                Create project
              </button>
            </div>
          </PermissionGate>

          <div className="resource-sidebar-list">
            {projects.length === 0 ? (
              <EmptyState message="No projects match your filters." />
            ) : (
              <ul className="resource-nav-list">
                {projects.map((p) => (
                  <ResourceNavItem
                    key={p.id}
                    name={p.name}
                    meta={`${p.team_count} teams · ${p.member_count} members · ${p.open_task_count} open tasks`}
                    active={p.id === selectedProjectId}
                    onClick={() => handleSelectProject(p.id)}
                    badge={p.status === "archived" ? <span className="badge badge-muted">Archived</span> : undefined}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="resource-detail card">
          {!selectedProjectId ? (
            <div className="resource-detail-empty">
              <EmptyState message="Select a project to view details." />
            </div>
          ) : detailLoading && !showDetail ? (
            <ResourceDetailLoading message="Loading project…" />
          ) : !showDetail ? (
            <div className="resource-detail-empty">
              <EmptyState message="Project details unavailable." />
            </div>
          ) : (
            <>
              <ResourceDetailHeader
                title={projectDetail.name}
                description={projectDetail.description || "No description provided."}
                badges={
                  projectDetail.status === "archived" ? (
                    <span className="badge badge-muted">Archived</span>
                  ) : (
                    <span className="badge badge-success">Active</span>
                  )
                }
                meta={[
                  { label: "Project lead", value: projectDetail.lead_username ?? "Unassigned" },
                  { label: "Teams", value: projectDetail.team_count },
                  { label: "Direct members", value: projectDetail.member_count },
                ]}
                actions={detailActions}
              />

              <ResourceTabs tabs={tabs} active={tab} onChange={setTab} />

              <div className="resource-detail-body">
                {tab === "overview" && (
                  <div className="resource-stat-grid">
                    <div className="resource-stat">
                      <span className="resource-stat-label">Open tasks</span>
                      <span className="resource-stat-value">{projectDetail.open_task_count}</span>
                    </div>
                    <div className="resource-stat">
                      <span className="resource-stat-label">Open issues</span>
                      <span className="resource-stat-value">{projectDetail.open_issue_count}</span>
                    </div>
                    <div className="resource-stat">
                      <span className="resource-stat-label">Assigned teams</span>
                      <span className="resource-stat-value">{projectDetail.team_count}</span>
                    </div>
                    <div className="resource-stat">
                      <span className="resource-stat-label">Direct members</span>
                      <span className="resource-stat-value">{projectDetail.member_count}</span>
                    </div>
                    <div className="resource-stat">
                      <span className="resource-stat-label">Created</span>
                      <span className="resource-stat-value resource-stat-value-sm">
                        {new Date(projectDetail.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}

                {tab === "teams" && (
                  <>
                    {!canAssignTeams ? (
                      projectDetail.teams.length === 0 ? (
                        <EmptyState message="No teams assigned to this project." />
                      ) : (
                        <div className="card-table-wrap">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Team</th>
                                <th>Members</th>
                                <th>Assigned</th>
                              </tr>
                            </thead>
                            <tbody>
                              {projectDetail.teams.map((t) => (
                                <tr key={t.team_id}>
                                  <td><Link to={`/teams/${t.team_id}`} className="link-primary">{t.team_name}</Link></td>
                                  <td>{t.member_count}</td>
                                  <td className="muted">{new Date(t.assigned_at).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : (
                      <>
                        <p className="resource-section-hint">
                          Select teams whose members should receive project access through team membership.
                        </p>
                        {teams.length === 0 ? (
                          <EmptyState message="No teams available in this workspace." />
                        ) : (
                          <>
                            <div className="resource-picker-grid">
                              {teams.map((t) => {
                                const selected = selectedTeamIds.includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    className={`resource-picker-item${selected ? " selected" : ""}`}
                                    onClick={() => toggleTeam(t.id)}
                                  >
                                    <span className="resource-picker-item-name">{t.name}</span>
                                    <span className="resource-picker-item-meta">{t.member_count} members</span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={actionId === "teams" || detailLoading || projectDetail?.id !== selectedProjectId}
                              onClick={handleSaveTeams}
                            >
                              Save team assignments
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {tab === "members" && (
                  <>
                    {canManageMembers && (
                      <div className="resource-toolbar-row">
                        <select className="select" value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)} aria-label="Add direct member">
                          <option value="">Select member to add…</option>
                          {availableMembers.map((m) => (
                            <option key={m.id} value={m.id}>{m.username} · {m.role_name}</option>
                          ))}
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" disabled={!addMemberId || actionId === "add-member"} onClick={handleAddMember}>
                          Add member
                        </button>
                      </div>
                    )}

                    {projectDetail.members.length === 0 ? (
                      <EmptyState message="No direct project members." />
                    ) : (
                      <div className="card-table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Member</th>
                              <th>Project role</th>
                              <th>Workspace role</th>
                              {canManageMembers && <th />}
                            </tr>
                          </thead>
                          <tbody>
                            {projectDetail.members.map((m) => (
                              <tr key={m.member_id}>
                                <td>
                                  <strong>{m.username}</strong>
                                  <div className="muted">{m.email}</div>
                                </td>
                                <td>
                                  <span className="badge">{m.role_in_project}</span>
                                  {projectDetail.lead_member_id === m.member_id && (
                                    <span className="badge badge-success">Lead</span>
                                  )}
                                </td>
                                <td className="muted">{m.role_name}</td>
                                {canManageMembers && (
                                  <td>
                                    <div className="resource-table-actions">
                                      {m.role_in_project !== "lead" && (
                                        <button type="button" className="btn btn-sm btn-secondary" disabled={actionId === `lead-${m.member_id}`} onClick={() => handleSetLead(m.member_id)}>
                                          Make lead
                                        </button>
                                      )}
                                      <button type="button" className="btn btn-sm btn-secondary" disabled={actionId === m.member_id} onClick={() => handleRemoveMember(m.member_id)}>
                                        Remove
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p className="resource-section-hint resource-section-hint-spaced">
                      Team-derived access is not listed here. Members assigned through teams retain access via those team links.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
