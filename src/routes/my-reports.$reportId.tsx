import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PainPill } from "@/components/shell";
import { useApp, useFmtDate, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { patientReports } from "@/lib/patient-reports";
import { VoicePlayer } from "@/components/voice";
import { ReportImageGallery } from "@/components/report-images";

export const Route = createFileRoute("/my-reports/$reportId")({
  head: () => ({ meta: [
    { title: "Report tracking | PalliaLink" }, { name: "description", content: "Original submitted symptoms and recorded report milestones for the linked patient." },
    { property: "og:title", content: "Report tracking | PalliaLink" }, { property: "og:description", content: "Patient-friendly report details and actual workflow updates." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: PatientReportDetails,
});

function PatientReportDetails() {
  const user = useGuard("patient");
  const { t } = useApp();
  const fmt = useFmtDate();
  const { reportId } = Route.useParams();
  useStoreVersion();
  if (!user) return null;
  const report = patientReports(user).find((r) => r.id === reportId);
  if (!report) return <AppShell><p role="status">{t.navigation.unavailable}</p></AppShell>;
  return <AppShell>
    <h1 className="text-3xl font-bold text-navy">{t.navigation.myReports} <span dir="ltr" className="inline-block font-mono text-xl">{report.id}</span></h1>
    <p className="mt-4 font-semibold text-primary">{t.navigation.status[report.status]}</p>
    <dl className="mt-6 grid gap-4 border-y py-6 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">{t.date}</dt><dd className="mt-1">{fmt(report.createdAt)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t.navigation.lastUpdate}</dt><dd className="mt-1">{fmt(report.lastUpdate)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{t.painLevel}</dt><dd className="mt-1"><PainPill pain={report.pain} /></dd></div>
      <div><dt className="text-sm text-muted-foreground">{t.otherSymptoms}</dt><dd className="mt-1">{report.symptoms.map((s) => t.symptoms[s]).join("، ") || "—"}</dd></div>
    </dl>
    <h2 className="mt-6 font-bold text-navy">{t.notes}</h2><p className="mt-2 whitespace-pre-wrap break-words">{report.notes || "—"}</p>
    {report.audioPath && <div className="mt-6"><VoicePlayer path={report.audioPath} durationS={report.audioDurationS} /></div>}
    <ReportImageGallery images={report.images} />
    <h2 className="mt-8 text-xl font-bold text-navy">{t.navigation.timeline}</h2>
    <ol className="mt-4 divide-y border-s ps-5">{report.milestones.map((m, index) => <li key={`${m.at}:${index}`} className="py-4"><p className="font-semibold">{t.navigation.status[m.status]}</p><p className="mt-1 text-sm text-muted-foreground">{fmt(m.at)}</p></li>)}</ol>
  </AppShell>;
}