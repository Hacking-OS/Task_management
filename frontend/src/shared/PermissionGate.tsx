import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
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
  const { hasAnyPermission, hasAllPermissions, isOwner, loading, workspaceName } = usePermissions();

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
          message={`You need ${allOf ? "all of" : "one of"} these permissions in ${workspaceName ?? activeWorkspace.name}: ${codes.join(", ")}`}
          requiredPermissions={codes}
        />
      );
    }
  }

  return <>{children}</>;
}

export function ForbiddenPage({
  message,
  requiredPermissions = [],
}: {
  message: string;
  requiredPermissions?: string[];
}) {
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { approvalFlowsEnabled, workspaceName } = usePermissions();
  const { refresh: refreshApprovals } = useApprovals();
  const toast = useToast();
  const [requesting, setRequesting] = useState<string | null>(null);

  const handleRequestApproval = async (permissionCode: string) => {
    if (!token || !activeWorkspace?.id) return;
    setRequesting(permissionCode);
    try {
      await api.createApprovalRequest(token, activeWorkspace.id, {
        permission_code: permissionCode,
        title: `Access request: ${permissionCode}`,
        description: message,
      });
      toast.success("Request sent", "Authorized reviewers will be notified.");
      await refreshApprovals();
    } catch (e) {
      toast.fromError(e, "Could not submit approval request");
    } finally {
      setRequesting(null);
    }
  };

  return (
    <div className="forbidden-page card">
      <h2>Access denied</h2>
      <p className="muted">{message}</p>

      {approvalFlowsEnabled && requiredPermissions.length > 0 && activeWorkspace && (
        <div className="approval-request-panel" style={{ marginTop: 16 }}>
          <p className="muted">
            You can request approval from the workspace creator for permissions you need in <strong>{workspaceName ?? activeWorkspace.name}</strong>.
          </p>
          <ul className="approval-perm-list">
            {requiredPermissions.map((code) => (
              <li key={code}>
                <code>{code}</code>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={requesting === code}
                  onClick={() => handleRequestApproval(code)}
                >
                  {requesting === code ? "Sending…" : "Request approval"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
