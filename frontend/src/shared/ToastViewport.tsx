import { useToast } from "../context/ToastContext";

const ICONS = {
  success: "✓",
  error: "✕",
  info: "i",
  warning: "!",
} as const;

export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`app-toast app-toast--${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <span className="app-toast-icon" aria-hidden="true">
            {ICONS[toast.kind]}
          </span>
          <div className="app-toast-body">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </div>
          <button
            type="button"
            className="app-toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
