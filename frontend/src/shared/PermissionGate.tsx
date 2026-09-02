import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePermissions } from "../context/PermissionsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { TablePageSkeleton } from "./Skeleton";

interface PermissionGateProps {
  /** Single permission code required. */
  permission?: string;
  /** Require any of these permissions. */
  anyOf?: string[];
  /** Require all of these permissions. */
  allOf?: string[];
  /** Only show when user is workspace owner. */
  ownerOnly?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  anyOf,
  allOf,
  ownerOnly,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasAnyPermission, hasAllPermissions, isOwner, loading } = usePermissions();

  if (loading) return null;

  if (ownerOnly && !isOwner) return <>{fallback}</>;

  const codes = allOf ?? anyOf ?? (permission ? [permission] : []);
  if (codes.length === 0) return <>{children}</>;

  const allowed = allOf ? hasAllPermissions(allOf) : hasAnyPermission(codes);
  if (!allowed) return <>{fallback}</>;

  return <>{children}</>;
}

interface RequirePermissionProps {
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
  ownerOnly?: boolean;
  /** When true, page loads even without an active workspace (e.g. workspace picker). */
  allowWithoutWorkspace?: boolean;
  children: ReactNode;
}

/** Route-level guard — blocks entire page when permission missing. */
export function RequirePermission({
  permission,
  anyOf,
  allOf,
  ownerOnly,
  allowWithoutWorkspace = false,
  children,
}: RequirePermissionProps) {
  const { activeWorkspace } = useWorkspace();
  const { hasAnyPermission, hasAllPermissions, isOwner, loading } = usePermissions();

  if (loading) return <TablePageSkeleton cols={4} filters={0} />;

  if (!activeWorkspace && !allowWithoutWorkspace) {
    return (
      <div className="forbidden-page card">
        <h2>Workspace required</h2>
        <p className="muted">Select or create a workspace to access this page.</p>
        <Link to="/workspaces" className="btn btn-primary" style={{ marginTop: 12 }}>
          Go to workspaces
        </Link>
      </div>
    );
  }

  if (ownerOnly && !isOwner) {
    return <ForbiddenPage message="Only the workspace owner can access this page." />;
  }

  const codes = allOf ?? anyOf ?? (permission ? [permission] : []);
  if (codes.length > 0 && activeWorkspace) {
    const allowed = allOf ? hasAllPermissions(allOf) : hasAnyPermission(codes);
    if (!allowed) {
      return (
        <ForbiddenPage
          message={`You need ${allOf ? "all of" : "one of"} these permissions: ${codes.join(", ")}`}
        />
      );
    }
  }

  return <>{children}</>;
}

export function ForbiddenPage({ message }: { message: string }) {
  return (
    <div className="forbidden-page card">
      <h2>Access denied</h2>
      <p className="muted">{message}</p>
    </div>
  );
}
