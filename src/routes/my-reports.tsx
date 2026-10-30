import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PainPill } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useApp, useFmtDate, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { patientReports } from "@/lib/patient-reports";

type Filter = "all" | "active" | "completed";
export const Route = createFileRoute("/my-reports")({
  validateSearch: (search: Record<string, unknown>): { filter: Filter } => ({ filter: search['filter'] === "active" || search['filter'] === "completed" ? search['filter'] : "all" }),
  head: () => ({ meta: [
    { title: "My reports | PalliaLink" }, { name: "description", content: "Patient and linked caregiver report history and actual care milestones." },
    { property: "og:title", content: "My reports | PalliaLink" }, { property: "og:description", content: "Follow submitted symptoms and the care team's recorded response." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: MyReports,
});

function MyReports() {
  const user = useGuard("patient");
  const { t } = useApp();
  const fmt = useFmtDate();
  const { filter } = Route.useSearch();
  useStoreVersion();
  if (!user) return null;
  const reports = patientReports(user).filter((r) => filter === "all" || (filter === "completed" ? r.status === "closed" : r.status !== "closed"));
  return <AppShell>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold text-navy">{t.navigation.myReports}</h1><Button asChild className="min-h-12"><Link to="/report">{t.newReport}</Link></Button></div>
    <nav className="mt-6 flex flex-wrap gap-2" aria-label={t.navigation.myReports}>
      {(["all", "active", "completed"] as const).map((key) => <Button key={key} asChild variant={filter === key ? "default" : "outline"} className="min-h-12"><Link to="/my-reports" search={{ filter: key }} aria-current={filter === key ? "page" : undefined}>{key === "all" ? t.filterAll : t.navigation[key]}</Link></Button>)}
    </nav>
    <ul className="mt-6 space-y-3">
      {reports.map((r) => <li key={r.id} className="card p-5"><Link to="/my-reports/$reportId" params={{ reportId: r.id }} className="flex flex-wrap items-center gap-4">
        <PainPill pain={r.pain} /><div className="min-w-0 flex-1"><h2 dir="ltr" className="font-mono font-semibold text-start">{r.id}</h2><p className="mt-1 text-sm">{r.symptoms.map((s) => t.symptoms[s]).join("، ") || t.painLevel}</p><p className="mt-1 text-xs text-muted-foreground">{t.reportDate}: {fmt(r.createdAt)}</p><p className="mt-1 text-xs text-muted-foreground">{t.navigation.lastUpdate}: {fmt(r.lastUpdate)}</p></div>
        <span className="text-sm font-semibold text-primary">{t.navigation.status[r.status]}</span>
      </Link></li>)}
      {!reports.length && <li className="py-6 text-muted-foreground">{t.noReports}</li>}
    </ul>
  </AppShell>;
}