import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import type { Workspace } from "../types";

interface Props {
  onActiveChange?: (ws: Workspace | undefined) => void;
}

export function WorkspacesPanel({ onActiveChange }: Props) {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<Workspace | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    api.getWorkspaces(token).then(({ workspaces, active }) => {
      setWorkspaces(workspaces);
      setActive(active);
      onActiveChange?.(active);
    }).finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;
    await api.createWorkspace(token, { name, description });
    setName("");
    setDescription("");
    load();
  };

  const activate = async (id: string) => {
    if (!token) return;
    const { workspace } = await api.activateWorkspace(token, id);
    setActive(workspace);
    onActiveChange?.(workspace);
    load();
  };

  const remove = async (id: string) => {
    if (!token || !confirm("Remove this workspace from your list?")) return;
    await api.deleteWorkspace(token, id);
    load();
  };

  if (loading) return <div className="panel-loading">Loading workspaces…</div>;

  return (
    <div className="panel">
      <header className="panel-header">
        <h2>Workspaces</h2>
        <span className="badge">{workspaces.length}</span>
      </header>

      <form className="workspace-form" onSubmit={create}>
        <input placeholder="Workspace name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button type="submit">Add workspace</button>
      </form>

      <ul className="workspace-list">
        {workspaces.length === 0 && <li className="empty">No workspaces yet. Create one above.</li>}
        {workspaces.map((ws) => (
          <li key={ws.id} className={ws.is_active ? "active" : ""}>
            <div className="ws-info">
              <strong>{ws.name}</strong>
              {ws.description && <p>{ws.description}</p>}
            </div>
            <div className="ws-actions">
              {!ws.is_active && (
                <button className="btn-secondary" onClick={() => activate(ws.id)}>Activate</button>
              )}
              {ws.is_active && <span className="active-tag">Active</span>}
              <button className="icon-btn danger" onClick={() => remove(ws.id)}>×</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
