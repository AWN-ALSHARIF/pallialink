import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, HeartPulse, Languages, LogOut, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp, useFmtDate, useName } from "@/lib/app";
import { isClinical, patientById, type Status } from "@/lib/store";
import { listNotifications, markNotificationsRead, type AppNotification } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { patientFeatures, usePatientAccess } from "@/lib/patient-access";
import { Button } from "@/components/ui/button";
import { ReadAloud } from "@/components/patient-communication";
import { BackNavigation } from "@/components/navigation";

export function Logo() {
  const { t } = useApp();
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-xl bg-navy text-navy-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold text-navy">{t.brand}</span>
        <span className="hidden text-xs text-primary sm:block">{t.tagline}</span>
      </span>
    </Link>
  );
}

export function LangButton() {
  const { lang, setLang, t } = useApp();
  return (
    <button className="btn btn-outline min-h-10 px-3 text-sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
      <Languages className="size-4" /> {t.langSwitch}
    </button>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  const { t } = useApp();
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm", className)}>
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
      <p>{t.disclaimer}</p>
    </div>
  );
}

function NotificationsBell() {
  const { t, user } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [open, setOpen] = useState(false);
  const clinical = !!user && isClinical(user.role);
  const load = useCallback(() => {
    if (clinical) return listNotifications().then(setItems, () => {});
    return Promise.resolve();
  }, [clinical, user?.id]);
  useEffect(() => {
    let live = true;
    setItems(null);
    setOpen(false);
    if (clinical) void listNotifications().then((next) => { if (live) setItems(next); }, () => {});
    return () => { live = false; };
  }, [clinical, user?.id]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);
  if (!clinical) return null;
  const unread = (items ?? []).filter((n) => !n.readAt);
  return (
    <div className="relative">
      <button className="btn btn-outline relative min-h-10 px-3" aria-label={t.notifications} title={t.notifications}
        onClick={() => { setOpen(!open); if (!open) load(); }}>
        <Bell className="size-4" />
        {unread.length > 0 && <span className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-background p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">{t.notifications}</h2>
            {unread.length > 0 && (
              <button className="text-xs font-semibold text-primary" onClick={() => { void markNotificationsRead(unread.map((n) => n.id)).then(load); }}>
                {t.markAllRead}
              </button>
            )}
          </div>
          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
            {(items ?? []).map((n) => (
              <li key={n.id} className={cn("rounded-lg border p-2.5", !n.readAt && "bg-accent/50")}>
                <p className="font-medium">{t.notifKind[n.kind]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {n.patientId ? `${name(patientById(n.patientId))} · ` : ""}{n.refId ? <span dir="ltr" className="font-mono">{n.refId}</span> : ""} · {fmt(n.createdAt)}
                </p>
              </li>
            ))}
            {items && items.length === 0 && <li className="py-3 text-center text-muted-foreground">{t.noNotifications}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, user, setUserId } = useApp();
  const { draft } = usePatientAccess();
  const features = patientFeatures(draft);
  const name = useName();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/40">
      <a href="#patient-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:bg-background focus:p-4">{t.access.skipContent}</a>
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 sm:flex sm:justify-between sm:gap-3">
          <div className="min-w-0"><Logo /></div>
          <div className="flex shrink-0 items-center gap-2">
            {user && (
              <div className="hidden text-end sm:block">
                <div className="text-sm font-semibold">{name(user)}</div>
                <div className="text-xs text-muted-foreground">{t.roles[user.role]}</div>
              </div>
            )}
            <NotificationsBell />
            <LangButton />
            <button
              className="btn btn-outline min-h-10 px-3"
              aria-label={t.signOut}
              title={t.signOut}
              onClick={async () => { await setUserId(null); navigate({ to: "/login", replace: true }); }}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      {user?.role === "patient" && features.simplified && <nav aria-label={t.brand} className="mx-auto flex max-w-7xl flex-wrap gap-3 px-4 pt-4"><Button asChild className="min-h-14"><Link to="/patient">{t.backHome}</Link></Button><Button asChild variant="outline" className="min-h-14"><Link to="/report">{t.newReport}</Link></Button></nav>}
      <main id="patient-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 md:py-8"><BackNavigation />{user?.role === "patient" && features.tts && <ReadAloud />}{children}</main>
    </div>
  );
}

const statusStyle: Record<Status, string> = {
  submitted: "bg-warning/15 text-foreground border-warning/40",
  acknowledged: "bg-accent text-accent-foreground border-primary/30",
  awaiting_physician: "bg-warning/10 text-foreground border-navy/30",
  under_review: "bg-navy/10 text-navy border-navy/20",
  follow_up: "bg-primary/15 text-accent-foreground border-primary/40",
  returned_to_nursing: "bg-destructive/10 text-foreground border-destructive/30",
  nursing_follow_up: "bg-accent text-accent-foreground border-warning/40",
  closed: "bg-success/15 text-foreground border-success/40",
};
export function StatusBadge({ status }: { status: Status }) {
  const { t } = useApp();
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusStyle[status])}>{t.status[status]}</span>;
}

export function PainPill({ pain }: { pain: number }) {
  const tone = pain >= 7 ? "bg-destructive/15 text-destructive" : pain >= 4 ? "bg-warning/20 text-foreground" : "bg-success/15 text-foreground";
  return <span className={cn("inline-grid min-w-8 place-items-center rounded-md px-2 py-0.5 text-sm font-bold", tone)}>{pain}</span>;
}
