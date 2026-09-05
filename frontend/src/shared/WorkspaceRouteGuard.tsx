import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { ErrorState } from "./StateBox";
import { TablePageSkeleton } from "./Skeleton";

interface WorkspaceRouteGuardProps {
  children: ReactNode;
  /** When true, sync URL workspace into active workspace context. */
  activate?: boolean;
}

/** Ensures the user is a member of the workspace in the URL before rendering children. */
export function WorkspaceRouteGuard({ children, activate = true }: WorkspaceRouteGuardProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, loading, activeWorkspace, setActive, switching } = useWorkspace();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const activating = useRef(false);

  const membership = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined;

  useEffect(() => {
    if (loading || !workspaceId) return;
    if (!membership) {
      setDenied(true);
      return;
    }
    setDenied(false);

    if (!activate || activeWorkspace?.id === workspaceId || activating.current) return;

    activating.current = true;
    void setActive(workspaceId).finally(() => {
      activating.current = false;
    });
  }, [loading, workspaceId, membership, activate, activeWorkspace?.id, setActive]);

  if (loading || switching || (activate && membership && activeWorkspace?.id !== workspaceId)) {
    return <TablePageSkeleton cols={4} filters={0} />;
  }

  if (!workspaceId) {
    return <ErrorState message="Workspace not specified." />;
  }

  if (denied || !membership) {
    return (
      <div>
        <ErrorState message="You don't have access to this workspace, or it no longer exists." />
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate("/workspaces", { replace: true })}>
          Go to workspaces
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
