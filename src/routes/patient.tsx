import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { PatientCommunication } from "@/components/patient-communication";
import { patientFeatures, usePatientAccess } from "@/lib/patient-access";
import { Button } from "@/components/ui/button";
import { AppShell, Disclaimer, PainPill, StatusBadge } from "@/components/shell";
import { AccessibilityPanel } from "@/components/accessibility";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { listReports, patientById } from "@/lib/store";

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
  const { draft } = usePatientAccess();
  const simple = patientFeatures(draft).simplified;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = useName();
  const fmt = useFmtDate();
  useStoreVersion();
  if (!user) return null;
  const patient = user.patientId ? patientById(user.patientId) : undefined;
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

      <PatientCommunication key={user.id} />
      <div className={simple ? "hidden" : "mt-6 grid gap-4 md:grid-cols-3"}>
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
            <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-primary">{t.navigation.status[reports[0].status]}</span><span className="text-sm text-muted-foreground">{fmt(reports[0].createdAt)}</span></div>
          ) : <div className="mt-2 text-muted-foreground">—</div>}
        </div>
      </div>

      {simple && <Button variant="outline" className="mt-6 min-h-14" aria-expanded={historyOpen} aria-controls="patient-history" onClick={() => setHistoryOpen(!historyOpen)}>{t.access.historyToggle}</Button>}
      <div id="patient-history" hidden={simple && !historyOpen}><div className="mt-10 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-navy">{t.reportHistory}</h2><Button asChild variant="outline" className="min-h-12"><Link to="/my-reports" search={{ filter: "all" }}>{t.navigation.myReports}</Link></Button></div>
      <div className="mt-4 space-y-3">
        {reports.length === 0 && <p className="text-muted-foreground">{t.noReports}</p>}
        {reports.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-4 p-4">
            <PainPill pain={r.pain} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.id}</div>
              <div className="text-sm text-muted-foreground">{fmt(r.createdAt)} · {r.symptoms.map((s) => t.symptoms[s]).join("، ") || "—"}</div>
            </div>
            <Button asChild variant="ghost" className="min-h-12 whitespace-normal text-start"><Link to="/my-reports/$reportId" params={{ reportId: r.id }} search={{ filter: "all" }}>{t.navigation.status[r.status]}</Link></Button>
          </div>
        ))}
      </div>
      </div>
      {simple && <Button variant="outline" className="mt-6 min-h-14 ms-3" aria-expanded={settingsOpen} aria-controls="patient-settings" onClick={() => setSettingsOpen(!settingsOpen)}>{t.access.settingsToggle}</Button>}
      {user.role === "patient" && user.patientId && <div id="patient-settings" hidden={simple && !settingsOpen} className="mt-10 border-t" onFocusCapture={() => setSettingsOpen(true)}><AccessibilityPanel key={`${user.id}:${user.patientId}`} patientId={user.patientId} personal /></div>}
      <Disclaimer className="mt-10" />
    </AppShell>
  );
}

