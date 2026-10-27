import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppShell, Disclaimer, PainPill, StatusBadge } from "@/components/shell";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { listReports, patientById, STATUSES, type Status } from "@/lib/store";

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "My care | PalliaLink" },
      { name: "description", content: "Patient and caregiver home: report symptoms and track status." },
      { property: "og:title", content: "My care | PalliaLink" },
      { property: "og:description", content: "Report symptoms and follow your care team's response." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientHome,
});

function PatientHome() {
  const user = useGuard("patient");
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  useStoreVersion();
  if (!user) return null;
  const patient = patientById(user.patientId!);
  const reports = listReports(user);
  const open = reports.filter((r) => r.status !== "closed").length;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground">{t.hello}،</p>
          <h1 className="text-3xl font-bold text-navy">{name(user)}</h1>
        </div>
        <Link to="/report" className="btn btn-primary min-h-14 px-7 text-lg"><Plus className="size-5" /> {t.newReport}</Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm text-muted-foreground">{t.patientOverview}</div>
          <div className="mt-1 text-xl font-bold text-navy">{name(patient)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t.age}: {patient?.age} · {patient && name({ nameAr: patient.conditionAr, nameEn: patient.conditionEn })}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-muted-foreground">{t.openReports}</div>
          <div className="mt-1 text-4xl font-bold text-primary">{open}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-muted-foreground">{t.lastReport}</div>
          {reports[0] ? (
            <div className="mt-2 flex items-center gap-2"><StatusBadge status={reports[0].status} /><span className="text-sm text-muted-foreground">{fmt(reports[0].createdAt)}</span></div>
          ) : <div className="mt-2 text-muted-foreground">—</div>}
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold text-navy">{t.reportHistory}</h2>
      <div className="mt-4 space-y-3">
        {reports.length === 0 && <p className="text-muted-foreground">{t.noReports}</p>}
        {reports.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-4 p-4">
            <PainPill pain={r.pain} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.id}</div>
              <div className="text-sm text-muted-foreground">{fmt(r.createdAt)} · {r.symptoms.map((s) => t.symptoms[s]).join("، ") || "—"}</div>
            </div>
            <StatusProgress status={r.status} />
            <StatusBadge status={r.status} />
          </div>
        ))}
      </div>
      <Disclaimer className="mt-10" />
    </AppShell>
  );
}

function StatusProgress({ status }: { status: Status }) {
  const idx = STATUSES.indexOf(status);
  return (
    <div className="hidden gap-1 sm:flex" aria-hidden>
      {STATUSES.map((s, i) => <span key={s} className={`h-1.5 w-6 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />)}
    </div>
  );
}
