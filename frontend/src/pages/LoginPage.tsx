import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { FormField, inputClass } from "../shared/FormField";
import {
  validateConfirmPassword,
  validateEmail,
  validateLoginIdentifier,
  validatePassword,
  validateUsername,
  type FormErrors,
  firstFormError,
  hasFormErrors,
} from "../utils/validation";

export function LoginPage() {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors<"identifier" | "username" | "email" | "password" | "confirmPassword">>({});
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setSubmitError("");
    setFieldErrors({});
    setPassword("");
    setConfirmPassword("");
  };

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
    setSubmitError("");

    const errors: FormErrors<"identifier" | "username" | "email" | "password" | "confirmPassword"> = {};
    if (mode === "login") {
      const idErr = validateLoginIdentifier(identifier);
      const passErr = validatePassword(password);
      if (idErr) errors.identifier = idErr;
      if (passErr) errors.password = passErr;
    } else {
      const userErr = validateUsername(username);
      const emailErr = validateEmail(email);
      const passErr = validatePassword(password, true);
      const confirmErr = validateConfirmPassword(password, confirmPassword);
      if (userErr) errors.username = userErr;
      if (emailErr) errors.email = emailErr;
      if (passErr) errors.password = passErr;
      if (confirmErr) errors.confirmPassword = confirmErr;
    }

    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setSubmitError(firstFormError(errors) ?? "Fix the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(identifier.trim(), password);
        toast.success("Signed in", "Welcome back.");
      } else {
        await register(username.trim(), email.trim(), password);
        toast.success("Account created", "You are now signed in.");
      }
    } catch (err) {
      toast.fromError(err, mode === "login" ? "Sign in failed" : "Registration failed");
      setSubmitError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="eyebrow">Jellyfish Workspace</p>
        <h1>{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="muted">Tasks, notifications, and workspace management in one place.</p>

        <div className="tab-row login-tabs">
          <button type="button" className={`tab-btn${mode === "login" ? " active" : ""}`} onClick={() => switchMode("login")}>
            Sign in
          </button>
          <button type="button" className={`tab-btn${mode === "register" ? " active" : ""}`} onClick={() => switchMode("register")}>
            Register
          </button>
        </div>

        <form className="login-form" onSubmit={submit} noValidate>
          {mode === "login" ? (
            <FormField label="Username or email" required error={fieldErrors.identifier}>
              <input
                className={inputClass("input", fieldErrors.identifier)}
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  clearError("identifier");
                }}
                placeholder="yourname or you@company.com"
              />
            </FormField>
          ) : (
            <>
              <FormField label="Username" required error={fieldErrors.username}>
                <input
                  className={inputClass("input", fieldErrors.username)}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    clearError("username");
                  }}
                  maxLength={32}
                />
              </FormField>
              <FormField label="Email" required error={fieldErrors.email}>
                <input
                  className={inputClass("input", fieldErrors.email)}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                />
              </FormField>
            </>
          )}
          <FormField
            label="Password"
            required
            hint={mode === "register" ? "At least 8 characters with a letter and a number." : undefined}
            error={fieldErrors.password}
          >
            <input
              className={inputClass("input", fieldErrors.password)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError("password");
              }}
            />
          </FormField>
          {mode === "register" && (
            <FormField label="Confirm password" required error={fieldErrors.confirmPassword}>
              <input
                className={inputClass("input", fieldErrors.confirmPassword)}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearError("confirmPassword");
                }}
              />
            </FormField>
          )}
          {submitError && <p className="form-error form-summary-error">{submitError}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "login" && <p className="hint muted">Demo account: demo / demo1234</p>}
      </div>
    </div>
  );
}
