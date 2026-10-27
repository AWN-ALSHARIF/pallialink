import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, Disclaimer } from "@/components/shell";
import { useApp } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { submitReport, SYMPTOMS, type Report, type Symptom } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report symptoms | PalliaLink" },
      { name: "description", content: "Report pain severity and symptoms to your home palliative care team." },
      { property: "og:title", content: "Report symptoms | PalliaLink" },
      { property: "og:description", content: "A simple 0–10 pain scale and symptom checklist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

function painTone(i: number, selected: boolean) {
  if (!selected) return "bg-card border-border hover:border-primary";
  if (i >= 7) return "bg-destructive text-destructive-foreground border-destructive";
  if (i >= 4) return "bg-warning text-foreground border-warning";
  return "bg-primary text-primary-foreground border-primary";
}

function ReportPage() {
  const user = useGuard("patient");
  const { t } = useApp();
  const [pain, setPain] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<Report | null>(null);
  if (!user) return null;

  if (done) {
    return (
      <AppShell>
        <div className="card mx-auto max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto size-16 text-success" />
          <h1 className="mt-4 text-2xl font-bold text-navy">{t.submitted}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{t.reportId}</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-primary" dir="ltr">{done.id}</p>
          <p className="mt-4 text-muted-foreground">{t.submittedSub}</p>
          <Link to="/patient" className="btn btn-navy mt-6 w-full">{t.backHome}</Link>
        </div>
      </AppShell>
    );
  }

  const toggle = (s: Symptom) => setSymptoms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const submit = () => {
    if (pain === null) return;
    try { setDone(submitReport(user, { pain, symptoms, notes })); } catch { toast.error("Error"); }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-navy">{t.newReport}</h1>
        <section className="card p-6">
          <h2 className="text-lg font-bold">{t.painLevel}</h2>
          <p className="text-sm text-muted-foreground">{t.painHint}</p>
          <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-11" role="radiogroup" aria-label={t.painLevel}>
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                role="radio"
                aria-checked={pain === i}
                onClick={() => setPain(i)}
                className={cn("grid h-14 place-items-center rounded-xl border-2 text-xl font-bold transition", painTone(i, pain === i))}
              >{i}</button>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <h2 className="text-lg font-bold">{t.otherSymptoms}</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SYMPTOMS.map((s) => (
              <button
                key={s}
                aria-pressed={symptoms.includes(s)}
                onClick={() => toggle(s)}
                className={cn("min-h-14 rounded-xl border-2 px-4 text-start font-semibold transition", symptoms.includes(s) ? "border-primary bg-accent text-accent-foreground" : "border-border hover:border-primary")}
              >{t.symptoms[s]}</button>
            ))}
          </div>
        </section>
        <section className="card p-6">
          <label htmlFor="notes" className="text-lg font-bold">{t.notes}</label>
          <textarea id="notes" rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPh} className="field mt-3" />
        </section>
        <button disabled={pain === null} onClick={submit} className="btn btn-primary min-h-14 w-full text-lg">{t.submit}</button>
        <Disclaimer />
      </div>
    </AppShell>
  );
}
