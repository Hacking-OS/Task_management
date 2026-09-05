import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { Icon } from "./icons/Icon";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActive, switching } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const switchTo = async (id: string) => {
    if (switching || activeWorkspace?.id === id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await setActive(id);
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="workspace-switcher" ref={rootRef}>
      <button
        type="button"
        className="workspace-chip workspace-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={switching}
      >
        <Icon name="workspaces" size={14} />
        {switching ? "Switching…" : (activeWorkspace?.name ?? "Select workspace")}
        <span className="workspace-switcher-chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="workspace-switcher-menu" role="listbox">
          {workspaces.length === 0 ? (
            <p className="muted workspace-switcher-empty">No workspaces yet.</p>
          ) : (
            workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                role="option"
                aria-selected={activeWorkspace?.id === ws.id}
                className={`workspace-switcher-item${activeWorkspace?.id === ws.id ? " active" : ""}`}
                onClick={() => void switchTo(ws.id)}
              >
                <span className="workspace-switcher-item-name">{ws.name}</span>
                <span className="muted workspace-switcher-item-role">
                  {ws.my_membership?.role_name ?? "Member"}
                </span>
              </button>
            ))
          )}
          <div className="workspace-switcher-footer">
            <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => { setOpen(false); navigate("/workspaces"); }}>
              Manage workspaces
            </button>
            <button type="button" className="btn btn-secondary btn-sm btn-block" onClick={() => { setOpen(false); navigate("/workspaces"); }}>
              Create workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
