import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ClipboardList, Lock, ArrowLeft, ArrowRight } from "lucide-react";
import { Disclaimer, LangButton, Logo } from "@/components/shell";
import { useApp } from "@/lib/app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PalliaLink | باليا لينك — Because Care Never Stops" },
      { name: "description", content: "PalliaLink connects home palliative care patients, families and care teams through transparent symptom reporting." },
      { property: "og:title", content: "PalliaLink — Because Care Never Stops" },
      { property: "og:description", content: "Arabic-first symptom reporting and care coordination for home-based palliative care." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t, lang } = useApp();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const features = [
    { icon: ClipboardList, title: t.f1t, desc: t.f1d },
    { icon: Activity, title: t.f2t, desc: t.f2d },
    { icon: Lock, title: t.f3t, desc: t.f3d },
  ];
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <LangButton />
          <Link to="/login" className="btn btn-navy hidden sm:inline-flex">{t.tryDemo}</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 lg:grid-cols-2 lg:pt-20">
        <div>
          <span className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">{t.tagline}</span>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-navy md:text-5xl">{t.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t.heroSub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="btn btn-primary min-h-12 px-6 text-base">{t.tryDemo} <Arrow className="size-4" /></Link>
            <a href="#how" className="btn btn-outline min-h-12 px-6 text-base">{t.howItWorks}</a>
          </div>
        </div>
        <PreviewCard />
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 pb-16 md:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary"><f.icon className="size-6" /></span>
            <h3 className="mt-4 text-lg font-bold text-navy">{f.title}</h3>
            <p className="mt-2 text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <section id="how" className="bg-navy py-16 text-navy-foreground">
        <div className="mx-auto max-w-7xl px-4">
          <h2 className="text-3xl font-bold">{t.howItWorks}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {t.steps.map((s, i) => (
              <li key={s} className="rounded-xl border border-navy-foreground/15 p-5">
                <span className="text-3xl font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-3 font-medium">{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl space-y-4 px-4 py-10">
        <Disclaimer />
        <p className="text-center text-sm text-muted-foreground">{t.footer}</p>
      </footer>
    </div>
  );
}

function PreviewCard() {
  const { t } = useApp();
  return (
    <div className="card relative p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-navy">{t.painLevel}</span>
        <span className="text-xs text-muted-foreground">PL-01008</span>
      </div>
      <div className="mt-4 grid grid-cols-11 gap-1.5">
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className={`grid aspect-square place-items-center rounded-lg text-sm font-bold ${i === 5 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i}</div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(["fatigue", "sleep"] as const).map((s) => (
          <span key={s} className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">{t.symptoms[s]}</span>
        ))}
      </div>
      <div className="mt-6 space-y-3 border-t pt-5">
        {(["submitted", "acknowledged", "under_review"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <span className={`size-3 rounded-full ${i < 2 ? "bg-primary" : "bg-warning"}`} />
            <span className="text-sm font-medium">{t.status[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
