import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveAuthenticatedEntry } from "../utils/authRedirect";
import { AppLoadingSkeleton } from "./Skeleton";

/** Redirects logged-in users away from /login to the correct workspace entry point. */
export function AuthEntryRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (loading || !user || ran.current) return;
    ran.current = true;
    void resolveAuthenticatedEntry("")
      .then((dest) => navigate(dest, { replace: true }))
      .finally(() => setReady(true));
  }, [user, loading, navigate]);

  if (!ready) return <AppLoadingSkeleton />;
  return null;
}
