import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../services/api";
import type { Comment } from "../models/types";
import { formatDate } from "../utils/severity";
import { Skeleton } from "./Skeleton";
import { FileAttachments } from "./FileAttachments";
import { PermissionGate } from "./PermissionGate";
import { UserAvatar } from "./UserAvatar";
import { FormField, inputClass } from "./FormField";
import { useMembers } from "../context/MembersContext";
import { firstFormError, hasFormErrors, validateCommentBody, type FormErrors } from "../utils/validation";

interface Props {
  entityType: string;
  entityId: string;
  workspaceId?: string;
}

export function CommentsSection({ entityType, entityId, workspaceId }: Props) {
  const { token, user } = useAuth();
  const toast = useToast();
  const { getMemberByUserId } = useMembers();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"body">>({});
  const [submitError, setSubmitError] = useState("");

  const load = () => {
    if (!token) return;
    api.getComments(token, entityType, entityId).then(({ comments: c }) => {
      setComments(c);
      setLoading(false);
    });
  };

  useEffect(load, [token, entityType, entityId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const bodyErr = validateCommentBody(body);
    const errors: FormErrors<"body"> = bodyErr ? { body: bodyErr } : {};
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Comment cannot be empty.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const { comment } = await api.createComment(token, {
        entity_type: entityType,
        entity_id: entityId,
        body: body.trim(),
        workspace_id: workspaceId,
      });
      if (pendingFile && workspaceId) {
        await api.uploadFile(token, workspaceId, pendingFile, "comment", comment.id);
      }
      setBody("");
      setPendingFile(null);
      setFieldErrors({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
      toast.created("Comment");
    } catch (err) {
      toast.fromError(err, "Could not post comment");
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card">
      <h3 className="card-title">Comments</h3>
      {loading ? (
        <div className="comment-skeletons">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="sk-comment-row" />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => {
            const author = getMemberByUserId(c.user_id);
            return (
            <li key={c.id}>
              <div className="comment-head">
                <UserAvatar
                  user={author ?? { user_id: c.user_id, username: c.user_id === user?.id ? user.username : c.user_id.slice(0, 8) }}
                  size="sm"
                  previewable
                />
                <span className="comment-meta">{c.user_id === user?.id ? "You" : author?.username ?? c.user_id.slice(0, 8)} · {formatDate(c.created_at)}</span>
              </div>
              <p>{c.body}</p>
              {workspaceId && (
                <FileAttachments
                  workspaceId={workspaceId}
                  category="comment"
                  entityId={c.id}
                  uploadPermission="comment.create"
                  variant="inline"
                />
              )}
            </li>
            );
          })}
        </ul>
      )}
      <form className="comment-form" onSubmit={submit} noValidate>
        <FormField label="Add comment" error={fieldErrors.body}>
          <textarea
            className={inputClass("input", fieldErrors.body)}
            rows={3}
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setFieldErrors({});
            }}
            maxLength={5000}
          />
        </FormField>
        {submitError && <p className="form-error form-summary-error">{submitError}</p>}
        {workspaceId && (
          <PermissionGate permission="comment.create">
            <div className="comment-file-row">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Attach file
              </button>
              {pendingFile && <span className="muted">{pendingFile.name}</span>}
            </div>
          </PermissionGate>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Posting…" : "Post comment"}
        </button>
      </form>
    </section>
  );
}
