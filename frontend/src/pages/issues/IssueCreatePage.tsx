import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import type { IssueStatus, Priority, Severity } from "../../models/types";
import { PageHeader } from "../../shared/PageHeader";
import { FormField, inputClass } from "../../shared/FormField";
import { SeveritySelect } from "../../shared/SeveritySelect";
import { StatusSelect } from "../../shared/StatusSelect";
import { AssignUsersField } from "../../shared/userAssignment";
import { firstFormError, hasFormErrors, validateIssueForm, type FormErrors } from "../../utils/validation";

export function IssueCreatePage() {
  const { token } = useAuth();
  const toast = useToast();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("open");
  const [priority, setPriority] = useState<Priority>("medium");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"title" | "description" | "workspace">>({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  const clearError = (key: keyof typeof fieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors = validateIssueForm({
      title,
      description,
      hasWorkspace: Boolean(activeWorkspace?.id),
    });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setLoading(true);
    setSubmitError("");
    try {
      const { issue } = await api.createIssue(token, {
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        severity,
        assignee_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
        workspace_id: activeWorkspace?.id ?? null,
      });
      toast.created("Issue");
      navigate(`/issues/${issue.id}`);
    } catch (err) {
      toast.fromError(err, "Could not create issue");
      setSubmitError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Create Issue" subtitle="Report a new issue in your workspace." />
      <form className="card form-stack" onSubmit={submit} noValidate>
        <FormField label="Title" required error={fieldErrors.title ?? fieldErrors.workspace}>
          <input
            className={inputClass("input", fieldErrors.title ?? fieldErrors.workspace)}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError("title");
              clearError("workspace");
            }}
            maxLength={200}
            autoFocus
          />
        </FormField>

        <FormField label="Description" hint="Optional. Include steps to reproduce or expected behavior." error={fieldErrors.description}>
          <textarea
            className={inputClass("input", fieldErrors.description)}
            rows={4}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError("description");
            }}
            maxLength={10000}
          />
        </FormField>

        <div className="form-row">
          <FormField label="Status">
            <StatusSelect entityType="issue" value={status} onChange={(v) => setStatus(v as IssueStatus)} />
          </FormField>
          <FormField label="Priority">
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </FormField>
          <FormField label="Severity">
            <SeveritySelect value={severity} onChange={(v) => setSeverity(v as Severity)} />
          </FormField>
        </div>

        <AssignUsersField entityType="issue" value={assigneeIds} onChange={setAssigneeIds} error={fieldErrors.workspace} />

        {submitError && <p className="form-error form-summary-error">{submitError}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/issues")}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Creating…" : "Create issue"}</button>
        </div>
      </form>
    </div>
  );
}
