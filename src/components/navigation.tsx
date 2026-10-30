import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/app";
import { NavigationVisits, roleDashboard } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

export function BackNavigation() {
  const { user, lang, t } = useApp();
  const router = useRouter();
  const location = useLocation();
  // AppShell remounts between routes: router holds this memory-only, identity-scoped ledger.
  const visits = useRef<NavigationVisits>(getVisits(router));
  const [previous, setPrevious] = useState<string | undefined>();
  useEffect(() => {
    if (!user) return;
    const index = location.state.__TSR_index;
    setPrevious(visits.current.previous(user.id, index, user.role));
    visits.current.visit(user.id, index, location.href);
  }, [location.href, location.state.__TSR_index, user?.id, user?.role]);
  if (!user) return null;
  const fallback = roleDashboard(user.role);
  const Arrow = lang === "ar" ? ArrowRight : ArrowLeft;
  return (
    <div className="mb-4">
      <Button variant="outline" className="min-h-11" disabled={!previous && location.pathname === fallback}
        onClick={() => { if (previous) router.history.back(); else void router.navigate({ to: fallback }); }}>
        <Arrow className="size-4" aria-hidden="true" />{t.back}
      </Button>
    </div>
  );
}

const ledgers = new WeakMap<object, NavigationVisits>();
function getVisits(router: object) {
  const existing = ledgers.get(router);
  if (existing) return existing;
  const visits = new NavigationVisits();
  ledgers.set(router, visits);
  return visits;
}