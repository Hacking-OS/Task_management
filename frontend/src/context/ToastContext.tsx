import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getErrorMessage } from "../utils/errorMessage";

export type ToastKind = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type PushToast = Omit<ToastItem, "id"> & { duration?: number };

type ToastContextValue = {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
  push: (toast: PushToast) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  created: (entity: string, message?: string) => void;
  updated: (entity: string, message?: string) => void;
  deleted: (entity: string, message?: string) => void;
  saved: (entity: string, message?: string) => void;
  patched: (entity: string, message?: string) => void;
  fromError: (err: unknown, title?: string, fallback?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4200,
  info: 4200,
  warning: 5200,
  error: 6500,
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ kind, title, message, duration }: PushToast) => {
      const id = makeId();
      const item: ToastItem = { id, kind, title, message };
      setToasts((prev) => [item, ...prev].slice(0, 5));
      const ms = duration ?? DEFAULT_DURATION[kind];
      const timer = window.setTimeout(() => dismiss(id), ms);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      dismiss,
      push,
      success: (title, message) => push({ kind: "success", title, message }),
      error: (title, message) => push({ kind: "error", title, message }),
      info: (title, message) => push({ kind: "info", title, message }),
      warning: (title, message) => push({ kind: "warning", title, message }),
      created: (entity, message) =>
        push({
          kind: "success",
          title: `${entity} created`,
          message: message ?? `${entity} was created successfully.`,
        }),
      updated: (entity, message) =>
        push({
          kind: "success",
          title: `${entity} updated`,
          message: message ?? `${entity} was updated successfully.`,
        }),
      deleted: (entity, message) =>
        push({
          kind: "success",
          title: `${entity} deleted`,
          message: message ?? `${entity} was removed successfully.`,
        }),
      saved: (entity, message) =>
        push({
          kind: "success",
          title: `${entity} saved`,
          message: message ?? "Your changes were saved.",
        }),
      patched: (entity, message) =>
        push({
          kind: "success",
          title: `${entity} updated`,
          message: message ?? "Changes were applied successfully.",
        }),
      fromError: (err, title = "Request failed", fallback) => {
        push({ kind: "error", title, message: getErrorMessage(err, fallback) });
      },
    }),
    [dismiss, push, toasts]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
