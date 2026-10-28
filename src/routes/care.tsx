import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, FileText, Search, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell";
import { TaskCard } from "@/components/tasks";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { listRecordPatients, type PatientRow } from "@/lib/emr";
import { useGuard } from "@/lib/guard";
import { listReports, patientById, userById } from "@/lib/store";
import {
  isFollowUpOverdue, isTaskOpen, isTaskOverdue, listFollowUps, listTasks,
  type FollowUp, type NursingTask,
} from "@/lib/tasks";

export const Route = createFileRoute("/care")({
  head: () => ({
    meta: [
      { title: "Care Hub | PalliaLink" },
      { name: "description", content: "Physician care hub: care-team patients, nursing tasks, follow-up plans and pending reports." },
      { property: "og:title", content: "Care Hub | PalliaLink" },
      { property: "og:description", content: "Longitudinal coordination for home palliative care patients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CareHub,
});

interface HubData {
  patients: PatientRow[];
  profiles: Map<string, { mrn: string; primary: string | null }>;
  latest: Map<string, { title: string; at: string }>;
  tasks: NursingTask[];
  followUps: FollowUp[];
}

type Filter = "all" | "reports" | "tasks" | "overdue";

function CareHub() {
  const user = useGuard("clinic");
  const navigate = useNavigate();
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const v = useStoreVersion();
  const [data, setData] = useState<HubData | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (user && user.role !== "physician") navigate({ to: "/clinic", replace: true });
  }, [user, navigate]);

  const reload = () => {
    if (!user || user.role !== "physician") return;
    (async () => {
      const supabase = (await import("@/integrations/supabase/client")).supabase;
      const [patients, tasks, followUps, profs, ents] = await Promise.all([
        listRecordPatients(), listTasks(), listFollowUps(),
        supabase.from("patient_profiles").select("patient_id,mrn,primary_diagnosis"),
        supabase.from("clinical_entries").select("patient_id,title,recorded_at").order("recorded_at", { ascending: false }).limit(300),
      ]);
      const profiles = new Map((profs.data ?? []).map((p) => [p.patient_id, { mrn: p.mrn, primary: p.primary_diagnosis }]));
      const latest = new Map<string, { title: string; at: string }>();
      for (const e of ents.data ?? []) if (!latest.has(e.patient_id)) latest.set(e.patient_id, { title: e.title, at: e.recorded_at });
      setData({ patients, profiles, latest, tasks, followUps });
    })().catch(() => setData({ patients: [], profiles: new Map(), latest: new Map(), tasks: [], followUps: [] }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [user?.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const myReports = useMemo(() => (user ? listReports(user).filter((r) => r.assigneeId === user.id && r.status !== "closed") : []), [user, v]);
  if (!user || user.role !== "physician") return null;

  const pendingReportsFor = (pid: string) => myReports.filter((r) => r.patientId === pid && ["awaiting_physician", "under_review", "follow_up"].includes(r.status));
  const openTasksFor = (pid: string) => (data?.tasks ?? []).filter((x) => x.patientId === pid && isTaskOpen(x));
  const nextFollowUpFor = (pid: string) => (data?.followUps ?? []).filter((f) => f.patientId === pid && f.status === "planned")[0];
  const lastFollowUpFor = (pid: string) => (data?.followUps ?? []).filter((f) => f.patientId === pid && f.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];

  const shown = (data?.patients ?? []).filter((p) => {
    const prof = data?.profiles.get(p.id);
    const hay = `${p.name_ar} ${p.name_en} ${prof?.mrn ?? ""}`.toLowerCase();
    if (!hay.includes(q.trim().toLowerCase())) return false;
    if (filter === "reports") return pendingReportsFor(p.id).length > 0;
    if (filter === "tasks") return openTasksFor(p.id).length > 0;
    if (filter === "overdue") {
      const nf = nextFollowUpFor(p.id);
      return (nf && isFollowUpOverdue(nf)) || openTasksFor(p.id).some(isTaskOverdue);
    }
    return true;
  });
  const reviewTasks = (data?.tasks ?? []).filter((x) => x.physicianId === user.id && (x.status === "completed_pending_review" || x.status === "unable"));
  const upcoming = (data?.followUps ?? []).filter((f) => f.status === "planned").sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 6);
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t.filterAll }, { id: "reports", label: t.filterPendingReports },
    { id: "tasks", label: t.filterOpenTasks }, { id: "overdue", label: t.filterOverdue },
  ];

  return (
    <AppShell>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-navy text-navy-foreground"><Stethoscope className="size-5" /></span>
        <div>
          <h1 className="text-3xl font-bold text-navy">{t.careHub}</h1>
          <p className="text-sm text-muted-foreground">{t.careHubSub}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="field ps-9" />
              </div>
              <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="tablist">
                {filters.map((f) => (
                  <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                    className={`btn min-h-10 shrink-0 text-xs ${filter === f.id ? "btn-navy" : "btn-outline"}`}>{f.label}</button>
                ))}
              </div>
            </div>
          </div>
          {!data && <p className="mt-6 text-muted-foreground">…</p>}
          {data && shown.length === 0 && <p className="card mt-4 p-6 text-center text-muted-foreground">{t.noHubPatients}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {shown.map((p) => {
              const prof = data?.profiles.get(p.id);
              const latest = data?.latest.get(p.id);
              const open = openTasksFor(p.id);
              const pending = pendingReportsFor(p.id);
              const next = nextFollowUpFor(p.id);
              const last = lastFollowUpFor(p.id);
              return (
                <Link key={p.id} to="/records/$patientId" params={{ patientId: p.id }} className="card block p-5 transition hover:border-primary">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold text-navy">{name(patientById(p.id))}</h2>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">{prof?.mrn ?? "—"}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{prof?.primary ?? (p.condition_ar)}</p>
                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.latestUpdate}</dt><dd className="text-end font-medium">{latest ? `${latest.title} · ${fmt(latest.at)}` : t.notDocumented}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.openTasks}</dt><dd className="font-medium">{open.length}{open.some(isTaskOverdue) ? ` · ${t.overdue}` : ""}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.pendingReports}</dt><dd className="font-medium">{pending.length}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.lastFollowUp}</dt><dd className="font-medium">{last ? last.targetDate : t.notDocumented}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.nextFollowUp}</dt><dd className={`font-medium ${next && isFollowUpOverdue(next) ? "text-destructive" : ""}`}>{next ? `${next.targetDate}${isFollowUpOverdue(next) ? ` · ${t.overdue}` : ""}` : "—"}</dd></div>
                  </dl>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 font-bold text-navy"><ClipboardList className="size-4" /> {t.pendingReview}</h2>
            <ul className="mt-3 space-y-3">
              {reviewTasks.map((x) => <TaskCard key={x.id} task={x} user={user} onDone={reload} />)}
              {reviewTasks.length === 0 && <li className="text-sm text-muted-foreground">{t.noTasks}</li>}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="font-bold text-navy">{t.upcomingFollowUps}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {upcoming.map((f) => (
                <li key={f.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{f.purpose}</strong>
                    {isFollowUpOverdue(f) && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{t.overdue}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {name(patientById(f.patientId))} · {t.followUpResponsible}: {name(userById(f.responsibleId))} · <span dir="ltr">{f.targetDate}</span>
                  </p>
                </li>
              ))}
              {upcoming.length === 0 && <li className="text-sm text-muted-foreground">{t.notDocumented}</li>}
            </ul>
          </section>
          <Link to="/records" className="btn btn-outline w-full min-h-10"><FileText className="size-4" /> {t.medicalRecord}</Link>
        </div>
      </div>
    </AppShell>
  );
}
