import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useApp } from "./app";
import { isClinical, type User } from "./store";

/** Client-side demo guard: redirects to the role selector or the right portal. */
export function useGuard(area: "patient" | "clinic"): User | null {
  const { user, ready } = useApp();
  const navigate = useNavigate();
  const ok = !!user && (area === "clinic" ? isClinical(user.role) : !isClinical(user.role));
  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login", replace: true });
    else if (!ok) navigate({ to: isClinical(user.role) ? "/clinic" : "/patient", replace: true });
  }, [ready, user, ok, navigate]);
  return ok ? user : null;
}
