import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, PainPill, StatusBadge } from "@/components/shell";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { getReport, listReports, patientById, userById } from "@/lib/store";
import { ClinicalNotes, RoleActions } from "@/components/report-actions";

export const Route = createFileRoute("/reports/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Report ${params.id} | PalliaLink` },
      { name: "description", content: "Symptom report details, workflow status and audit timeline." },
      { property: "og:title", content: `Report ${params.id} | PalliaLink` },
      { property: "og:description", content: "Symptom report details and audit timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportDetail,
});

function ReportDetail() {
  const { id } = Route.useParams();
  const user = useGuard("clinic");
  const { t, lang } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  useStoreVersion();
  if (!user) return null;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const r = getReport(user, id);
  const backLink = <Link to="/clinic" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Back className="size-4" /> {t.back}</Link>;
  if (!r) return <AppShell>{backLink}<p className="card mt-6 p-8 text-center text-muted-foreground">{t.notFound}</p></AppShell>;

  const patient = patientById(r.patientId);
  const history = listReports(user).filter((x) => x.patientId === r.patientId);

  return (
    <AppShell>
      {backLink}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-3xl font-bold text-navy" dir="ltr">{r.id}</h1>
        <StatusBadge status={r.status} />
      </div>

      {r.pain >= 7 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <p><strong className="me-1">[{t.simAlert}]</strong>{t.simAlertText}</p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-6">
            <h2 className="font-bold text-navy">{t.reportDetail}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Item label={t.patient}>{name(patient)} · {t.age} {patient?.age}</Item>
              <Item label={t.submittedBy}>{name(userById(r.submittedBy))}</Item>
              <Item label={t.painLevel}><PainPill pain={r.pain} /> / 10</Item>
              <Item label={t.date}>{fmt(r.createdAt)}</Item>
              <Item label={t.otherSymptoms}>{r.symptoms.map((s) => t.symptoms[s]).join("، ") || "—"}</Item>
              <Item label={t.notes}>{r.notes || "—"}</Item>
            </dl>
          </section>

          <ClinicalNotes report={r} />

          <section className="card p-6">
            <h2 className="font-bold text-navy">{t.timeline}</h2>
            <ol className="mt-4 space-y-4 border-s-2 border-border ps-5">
              {[...r.activity].reverse().map((a, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[27px] top-1.5 size-3 rounded-full bg-primary ring-4 ring-background" />
                  <p className="text-sm">
                    <strong>{name(userById(a.byUserId))}</strong> {t.act[a.type]}{" "}
                    {a.status && <StatusBadge status={a.status} />}
                    {a.assigneeId && <strong>{name(userById(a.assigneeId))}</strong>}
                  </p>
                  {a.note && <p className="mt-1 rounded-lg bg-muted p-2 text-sm">{a.note}</p>}
                  {a.plan && <p className="mt-1 rounded-lg bg-accent p-2 text-sm"><strong>{t.plan}:</strong> {a.plan}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmt(a.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <RoleActions user={user} report={r} />

          <section className="card p-5">
            <h2 className="font-bold text-navy">{t.symptomHistory}</h2>
            <ul className="mt-3 space-y-2">
              {history.map((h) => (
                <li key={h.id}>
                  <Link to="/reports/$id" params={{ id: h.id }} className={`flex items-center gap-3 rounded-lg p-2 hover:bg-muted ${h.id === r.id ? "bg-accent" : ""}`}>
                    <PainPill pain={h.pain} />
                    <span className="flex-1 text-sm">{fmt(h.createdAt)}</span>
                    <StatusBadge status={h.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1 font-medium">{children}</dd>
    </div>
  );
}
