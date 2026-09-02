import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PermissionGate } from "../../shared/PermissionGate";
import { api } from "../../services/api";
import { PageHeader } from "../../shared/PageHeader";
import { FormField, inputClass } from "../../shared/FormField";
import { TablePageSkeleton } from "../../shared/Skeleton";
import { EmptyState } from "../../shared/StateBox";
import { firstFormError, hasFormErrors, validateWorkspaceForm, type FormErrors } from "../../utils/validation";

export function WorkspacesPage() {
  const { token } = useAuth();
  const toast = useToast();
  const { workspaces, activeWorkspace, loading, refresh, setActive } = useWorkspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"name" | "description">>({});
  const [submitError, setSubmitError] = useState("");

  const clearError = (key: keyof typeof fieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors = validateWorkspaceForm({ name, description });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setCreating(true);
    setSubmitError("");
    try {
      await api.createWorkspace(token, {
        name: name.trim(),
        description: description.trim(),
      });
      setName("");
      setDescription("");
      setFieldErrors({});
      await refresh();
      toast.created("Workspace");
    } catch (err) {
      toast.fromError(err, "Could not create workspace");
      setSubmitError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!token || !confirm("Delete this workspace?")) return;
    try {
      await api.deleteWorkspace(token, id);
      await refresh();
      toast.deleted("Workspace");
    } catch (err) {
      toast.fromError(err, "Could not delete workspace");
    }
  };

  if (loading) return <TablePageSkeleton cols={3} filters={0} />;

  return (
    <div>
      <PageHeader title="Workspaces" subtitle="Create and manage team workspaces for tasks, issues, and files." />

      <section className="card">
        <h3 className="card-title">Create workspace</h3>
        <form className="form-grid" onSubmit={create} noValidate>
          <FormField label="Name" required error={fieldErrors.name}>
            <input
              className={inputClass("input", fieldErrors.name)}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              maxLength={80}
            />
          </FormField>
          <FormField label="Description" className="span-2" error={fieldErrors.description}>
            <input
              className={inputClass("input", fieldErrors.description)}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError("description");
              }}
              maxLength={10000}
            />
          </FormField>
          {submitError && <p className="form-error form-summary-error span-2">{submitError}</p>}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </section>

      {workspaces.length === 0 ? (
        <EmptyState message="No workspaces yet. Create one to get started." />
      ) : (
        <div className="card-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link to={`/workspaces/${w.id}`} className="link-primary">{w.name}</Link>
                  </td>
                  <td className="muted">{w.description || "—"}</td>
                  <td>
                    {activeWorkspace?.id === w.id ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge">Inactive</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    {activeWorkspace?.id !== w.id && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setActive(w.id)}>
                        Activate
                      </button>
                    )}
                    <Link to={`/workspaces/${w.id}`} className="btn btn-sm btn-ghost">Open</Link>
                    <PermissionGate permission="workspace.delete">
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(w.id)}>Delete</button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
