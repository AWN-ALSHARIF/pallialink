import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, HeartHandshake, Search, Stethoscope, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PainPill, StatusBadge } from "@/components/shell";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { listReports, needsNurseAction, patientById, PHYSICIANS, STATUSES, userById, type Report, type Status } from "@/lib/store";

type Scope = "default" | "mine" | "escalated" | "all";

export const Route = createFileRoute("/clinic")({
  head: () => ({
    meta: [
      { title: "Care team dashboard | PalliaLink" },
      { name: "description", content: "Review, assign and track home palliative care symptom reports." },
      { property: "og:title", content: "Care team dashboard | PalliaLink" },
      { property: "og:description", content: "A transparent workflow for symptom reports from submission to closure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clinic,
});

function Clinic() {
  const user = useGuard("clinic");
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const v = useStoreVersion();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [scope, setScope] = useState<Scope>("default");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reports = useMemo(() => (user ? listReports(user) : []), [user, v]);
  if (!user) return null;

  const scopes: { id: Scope; label: string }[] =
    user.role === "nurse" ? [{ id: "default", label: t.scopeAction }, { id: "mine", label: t.scopeMine }, { id: "escalated", label: t.scopeEscalated }, { id: "all", label: t.scopeAll }]
    : user.role === "physician" ? [{ id: "default", label: t.scopeMine }]
    : [];
  const inScopeFor = (sc: Scope, r: Report) => {
    if (user.role === "admin" || sc === "all") return true;
    if (user.role === "physician") return r.assigneeId === user.id;
    if (sc === "mine") return r.assigneeId === user.id;
    if (sc === "escalated") return PHYSICIANS.some((p) => p.id === r.assigneeId);
    return needsNurseAction(user, r); // nurse default: items requiring her action
  };
  const filtered = reports.filter((r) => inScopeFor(scope, r)).filter((r) => {
    const p = patientById(r.patientId);
    const hay = `${r.id} ${p?.nameAr} ${p?.nameEn}`.toLowerCase();
    return (status === "all" || r.status === status) && hay.includes(q.trim().toLowerCase());
  });
  const scoped = reports.filter((r) => user.role !== "physician" || r.assigneeId === user.id);
  const count = (s: Status) => scoped.filter((r) => r.status === s).length;
  const stats = [
    { label: t.totalReports, value: scoped.length, tone: "text-navy" },
    { label: t.awaiting, value: count("submitted"), tone: "text-warning" },
    { label: t.returnedCount, value: count("returned_to_nursing"), tone: "text-destructive" },
    { label: t.inProgress, value: count("acknowledged") + count("awaiting_physician") + count("under_review") + count("follow_up") + count("nursing_follow_up"), tone: "text-primary" },
    { label: t.closedCount, value: count("closed"), tone: "text-success" },
  ];
  const chart = STATUSES.map((s) => ({ name: t.status[s], value: count(s) }));

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid size-11 place-items-center rounded-xl ${user.role === "physician" ? "bg-navy text-navy-foreground" : "bg-accent text-primary"}`}>
          {user.role === "physician" ? <Stethoscope className="size-5" /> : user.role === "nurse" ? <HeartHandshake className="size-5" /> : <UserCog className="size-5" />}
        </span>
        <h1 className="text-3xl font-bold text-navy">{user.role === "nurse" ? t.nurseDashboard : user.role === "physician" ? t.physicianDashboard : t.adminDashboard}</h1>
        {user.role !== "admin" && <Link to="/records" className="btn btn-outline ms-auto min-h-10"><FileText className="size-4" /> {t.medicalRecord}</Link>}
        {user.canApproveClosure && <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold">{t.closureAuthorized}</span>}
      </div>
      {scopes.length > 1 && (
        <div className="mt-5 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="tablist">
          {scopes.map((s) => (
            <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)} className={`btn min-h-10 shrink-0 ${scope === s.id ? "btn-navy" : "btn-outline"}`}>
              {s.label} <span className="rounded-full bg-background/20 px-2 text-xs">{reports.filter((r) => inScopeFor(s.id, r)).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className={`mt-1 text-4xl font-bold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap gap-3 border-b p-4">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="field ps-9" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} className="field w-auto">
              <option value="all">{t.allStatuses}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr className="text-start">
                  {[
                    { h: t.reportId, cls: "" }, { h: t.patient, cls: "" }, { h: t.pain, cls: "" },
                    { h: t.statusCol, cls: "" }, { h: t.assignee, cls: "hidden md:table-cell" }, { h: t.date, cls: "hidden md:table-cell" },
                  ].map(({ h, cls }) => (
                    <th key={h} className={`px-4 py-3 text-start font-semibold ${cls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono font-semibold"><Link to="/reports/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.id}</Link></td>
                    <td className="px-4 py-3 font-medium">{name(patientById(r.patientId))}</td>
                    <td className="px-4 py-3"><PainPill pain={r.pain} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{r.assigneeId ? name(userById(r.assigneeId)) : t.unassigned}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t.noReports}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-bold text-navy">{t.reportsByStatus}</h2>
          <div className="mt-4 h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
