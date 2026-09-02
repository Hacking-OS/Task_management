import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  error?: string | null;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, error, required, hint, className, children }: FormFieldProps) {
  return (
    <label className={`form-field${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}>
      <span className="form-field-label">
        {label}
        {required ? <span className="form-required" aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="form-hint">{hint}</span> : null}
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </label>
  );
}

export function inputClass(base = "input", error?: string | null) {
  return error ? `${base} input-invalid` : base;
}
