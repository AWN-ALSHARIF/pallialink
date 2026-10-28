import { Link, useNavigate } from "@tanstack/react-router";
import { HeartPulse, Languages, LogOut, RotateCcw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useApp, useName } from "@/lib/app";
import { resetDemo, type Status } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Logo() {
  const { t } = useApp();
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-xl bg-navy text-navy-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold text-navy">{t.brand}</span>
        <span className="block text-xs text-primary">{t.tagline}</span>
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

export function AppShell({ children }: { children: ReactNode }) {
  const { t, user, setUserId } = useApp();
  const name = useName();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden text-end sm:block">
                <div className="text-sm font-semibold">{name(user)}</div>
                <div className="text-xs text-muted-foreground">{t.roles[user.role]}</div>
              </div>
            )}
            <LangButton />
            <button className="btn btn-outline min-h-10 px-3" title={t.resetDemo} aria-label={t.resetDemo} onClick={() => { void resetDemo().catch(() => {}); }}>
              <RotateCcw className="size-4" />
            </button>
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
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}

const statusStyle: Record<Status, string> = {
  submitted: "bg-warning/15 text-foreground border-warning/40",
  acknowledged: "bg-accent text-accent-foreground border-primary/30",
  under_review: "bg-navy/10 text-navy border-navy/20",
  follow_up: "bg-primary/15 text-accent-foreground border-primary/40",
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
