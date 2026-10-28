import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { useApp } from "@/lib/app";
import { listRecordPatients, type PatientRow } from "@/lib/emr";
import { useGuard } from "@/lib/guard";

export const Route = createFileRoute("/records/")({
  head: () => ({
    meta: [
      { title: "Medical records | PalliaLink" },
      { name: "description", content: "Authorized patient medical records for the home palliative care team." },
      { property: "og:title", content: "Medical records | PalliaLink" },
      { property: "og:description", content: "Longitudinal patient records for authorized nurses and physicians." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Records,
});

function Records() {
  const user = useGuard("clinic");
  const { t, lang } = useApp();
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  useEffect(() => { if (user) listRecordPatients().then(setRows, () => setRows([])); }, [user]);
  if (!user) return null;
  return (
    <AppShell>
      <h1 className="text-3xl font-bold text-navy">{t.medicalRecord}</h1>
      <p className="mt-1 text-muted-foreground">{t.recordsSub}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows === null && <p className="text-muted-foreground">…</p>}
        {rows?.length === 0 && <p className="card p-6 text-muted-foreground">{t.noAccessRecord}</p>}
        {rows?.map((p) => (
          <Link key={p.id} to="/records/$patientId" params={{ patientId: p.id }} className="card flex items-center gap-4 p-5 transition hover:border-primary">
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-primary"><FileText className="size-5" /></span>
            <span>
              <span className="block font-bold">{lang === "ar" ? p.name_ar : p.name_en}</span>
              <span className="block text-sm text-muted-foreground">{t.age} {p.age} · {lang === "ar" ? p.condition_ar : p.condition_en}</span>
            </span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
