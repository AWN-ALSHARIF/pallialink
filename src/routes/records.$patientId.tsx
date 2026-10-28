import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText, Lock, Pencil, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AppShell, PainPill, StatusBadge } from "@/components/shell";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { addEntry, loadRecord, openDocument, updateProfile, uploadDocument, WRITABLE, type Entry, type EntryKind, type Profile } from "@/lib/emr";
import { useGuard } from "@/lib/guard";
import { listReports, userById, type User } from "@/lib/store";

export const Route = createFileRoute("/records/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient medical record | PalliaLink" },
      { name: "description", content: "Longitudinal medical record: history, medications, allergies, investigations, notes and care plans." },
      { property: "og:title", content: "Patient medical record | PalliaLink" },
      { property: "og:description", content: "Authorized longitudinal patient record for the palliative care team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecordPage,
});

type Tab = "history" | "medications" | "allergies" | "investigations" | "notes" | "care" | "documents" | "reports" | "timeline";
const TABS: Tab[] = ["history", "medications", "allergies", "investigations", "notes", "care", "documents", "reports", "timeline"];
const TAB_KINDS: Partial<Record<Tab, EntryKind[]>> = {
  medications: ["medication"], allergies: ["allergy"], investigations: ["lab", "vital"],
  notes: ["nursing_note", "physician_assessment", "encounter"], care: ["care_plan"], documents: ["document"],
};
type Rec = NonNullable<Awaited<ReturnType<typeof loadRecord>>>;

function RecordPage() {
  const { patientId } = Route.useParams();
  const user = useGuard("clinic");
  const { t, lang } = useApp();
  const [rec, setRec] = useState<Rec | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("history");
  const reload = useCallback(() => loadRecord(patientId).then(setRec, () => setRec(null)), [patientId]);
  useEffect(() => { if (user) void reload(); }, [user, reload]);
  if (!user) return null;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const back = <Link to="/records" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Back className="size-4" /> {t.medicalRecord}</Link>;
  if (rec === undefined) return <AppShell>{back}<p className="mt-6 text-muted-foreground">…</p></AppShell>;
  if (rec === null) return <AppShell>{back}<p className="card mt-6 flex items-center justify-center gap-2 p-8 text-muted-foreground"><Lock className="size-4" />{t.noAccessRecord}</p></AppShell>;

  return (
    <AppShell>
      {back}
      <Summary rec={rec} />
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn min-h-10 shrink-0 ${tab === k ? "btn-navy" : "btn-outline"}`}>{t.tabs[k]}</button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "history" && <HistoryTab rec={rec} user={user} onSaved={reload} />}
        {tab === "reports" && <ReportsTab user={user} patientId={patientId} />}
        {tab === "timeline" && <TimelineTab rec={rec} user={user} />}
        {TAB_KINDS[tab] && <EntriesTab key={tab} tab={tab} rec={rec} user={user} onSaved={reload} />}
      </div>
    </AppShell>
  );
}

function Val({ v }: { v: string | null | undefined }) {
  const { t } = useApp();
  return v?.trim() ? <span>{v}</span> : <span className="italic text-muted-foreground">{t.notDocumented}</span>;
}

function Summary({ rec }: { rec: Rec }) {
  const { t, lang } = useApp();
  const p = rec.profile;
  const allergies = rec.entries.filter((e) => e.kind === "allergy");
  const negative = allergies.some((a) => a.status === "none_known");
  const active = allergies.filter((a) => a.status === "active");
  return (
    <section className="card mt-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">{lang === "ar" ? rec.patient.name_ar : rec.patient.name_en}</h1>
        <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold">{t.synthetic}</span>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Item label={t.mrn}><span dir="ltr" className="font-mono"><Val v={p?.mrn} /></span></Item>
        <Item label={t.age}>{rec.patient.age} · <Val v={p?.sex} /></Item>
        <Item label={t.primaryDx}><Val v={p?.primary_diagnosis} /></Item>
        <Item label={t.careStatus}><Val v={p?.care_status} /></Item>
        <Item label={t.palliativeDx}><Val v={p?.palliative_diagnosis} /></Item>
        <Item label={t.secondaryDx}><Val v={p?.secondary_diagnoses?.join("، ")} /></Item>
        <Item label={t.tabs.allergies}>
          {active.length > 0 ? <span className="font-semibold text-destructive">{active.map((a) => a.title).join("، ")}</span>
            : negative ? <span>{t.noKnownAllergies} <span className="rounded bg-success/15 px-1.5 text-xs">{t.documentedNegative}</span></span>
            : <span className="italic text-muted-foreground">{t.notDocumented}</span>}
        </Item>
        <Item label={t.goals}><Val v={p?.goals_of_care} /></Item>
      </dl>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{children}</dd></div>;
}

const PROFILE_FIELDS: { key: keyof Profile; label: (t: ReturnType<typeof useApp>["t"]) => string }[] = [
  { key: "primary_diagnosis", label: (t) => t.primaryDx },
  { key: "secondary_diagnoses", label: (t) => t.secondaryDx },
  { key: "palliative_diagnosis", label: (t) => t.palliativeDx },
  { key: "care_status", label: (t) => t.careStatus },
  { key: "sex", label: (t) => t.sex },
  { key: "language", label: (t) => t.language },
  { key: "past_medical_history", label: (t) => t.pmh },
  { key: "surgical_history", label: (t) => t.surgical },
  { key: "family_history", label: (t) => t.family },
  { key: "social_history", label: (t) => t.social },
  { key: "goals_of_care", label: (t) => t.goals },
  { key: "patient_preferences", label: (t) => t.preferences },
];

function HistoryTab({ rec, user, onSaved }: { rec: Rec; user: User; onSaved: () => Promise<unknown> }) {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const p = rec.profile;
  const str = (k: keyof Profile) => { const v = p?.[k]; return Array.isArray(v) ? v.join("، ") : (v as string | null) ?? ""; };
  const start = () => { setForm(Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, str(f.key)]))); setEdit(true); };
  const save = () => {
    const changed: Record<string, string | string[] | null> = {};
    for (const f of PROFILE_FIELDS) {
      const v = (form[f.key] ?? "").trim();
      if (v === str(f.key)) continue;
      changed[f.key] = f.key === "secondary_diagnoses" ? v.split(/[،,]/).map((x) => x.trim()).filter(Boolean) : v || null;
    }
    if (!Object.keys(changed).length) { setEdit(false); return; }
    updateProfile(rec.patient.id, changed).then(() => onSaved()).then(() => { setEdit(false); toast.success("✓"); }, () => toast.error(t.readOnly));
  };
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-navy">{t.tabs.history}</h2>
        {user.role === "physician" && !edit && <button className="btn btn-outline min-h-10" onClick={start}><Pencil className="size-4" /> {t.editProfile}</button>}
      </div>
      {edit ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm font-semibold">{f.label(t)}
              <textarea rows={2} className="field mt-1 font-normal" value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
          <div className="flex gap-2 md:col-span-2">
            <button className="btn btn-primary" onClick={save}>{t.saveProfile}</button>
            <button className="btn btn-outline" onClick={() => setEdit(false)}>{t.cancel}</button>
          </div>
        </div>
      ) : (
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          {PROFILE_FIELDS.map((f) => <Item key={f.key} label={f.label(t)}><Val v={str(f.key)} /></Item>)}
        </dl>
      )}
      {p?.updated_by && <p className="mt-4 text-xs text-muted-foreground">{t.by} {name(userById(p.updated_by))} · {fmt(p.updated_at)}</p>}
    </section>
  );
}

const FIELDS: Partial<Record<EntryKind, ("dose" | "schedule" | "reaction" | "severity" | "value" | "unit" | "range" | "bp" | "hr" | "spo2" | "temp")[]>> = {
  medication: ["dose", "schedule"], allergy: ["reaction", "severity"], lab: ["value", "unit", "range"], vital: ["bp", "hr", "spo2", "temp"],
};
const STATUSES_FOR: Partial<Record<EntryKind, string[]>> = { medication: ["active", "changed", "stopped"], allergy: ["active", "none_known", "resolved"], care_plan: ["active", "resolved"] };

function EntryRow({ e }: { e: Entry }) {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const d = e.detail ?? {};
  const facts = Object.entries(d).filter(([k, v]) => !["changed", "path", "name", "size"].includes(k) && v !== undefined && v !== "");
  const isProfile = e.kind === "encounter" && e.title === "profile_update";
  return (
    <li className="rounded-lg border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 text-xs">{t.kinds[e.kind]}</span>
        <strong>{isProfile ? t.editProfile : e.title}</strong>
        {e.status && <span className={`rounded px-1.5 text-xs ${e.status === "none_known" ? "bg-success/15" : "bg-accent"}`}>{t.entryStatus[e.status as keyof typeof t.entryStatus] ?? e.status}{e.status === "none_known" ? ` · ${t.documentedNegative}` : ""}</span>}
        {e.is_synthetic && <span className="rounded bg-warning/15 px-1.5 text-[10px]">{t.synthetic}</span>}
      </div>
      {facts.length > 0 && <p className="mt-1 text-muted-foreground">{facts.map(([k, v]) => `${(t as unknown as Record<string, string>)[k] ?? k}: ${v}`).join(" · ")}</p>}
      {isProfile && d.changed && <p className="mt-1 text-muted-foreground">{Object.keys(d.changed).join("، ")}</p>}
      {e.note && <p className="mt-1">{e.note}</p>}
      {e.kind === "document" && d.path && <button className="mt-1 text-primary underline" onClick={() => openDocument(e.patient_id, String(d.path)).catch(() => toast.error(t.readOnly))}>{t.openDoc}</button>}
      <p className="mt-1 text-xs text-muted-foreground">{name(userById(e.created_by))} · {fmt(e.recorded_at)}</p>
    </li>
  );
}

function EntriesTab({ tab, rec, user, onSaved }: { tab: Tab; rec: Rec; user: User; onSaved: () => Promise<unknown> }) {
  const { t } = useApp();
  const kinds = TAB_KINDS[tab]!;
  const list = rec.entries.filter((e) => kinds.includes(e.kind) && !(e.kind === "encounter" && e.title === "profile_update"));
  const writable = kinds.filter((k) => (WRITABLE[user.role] ?? []).includes(k));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card p-6 lg:col-span-2">
        <h2 className="font-bold text-navy">{t.tabs[tab]}</h2>
        {tab === "medications" ? (
          <>
            <h3 className="mt-4 text-sm font-semibold">{t.currentMeds}</h3>
            <EntryList items={list.filter((e) => e.status !== "stopped")} />
            <h3 className="mt-4 text-sm font-semibold">{t.previousMeds}</h3>
            <EntryList items={list.filter((e) => e.status === "stopped")} />
          </>
        ) : <EntryList items={list} />}
      </section>
      {tab === "documents" ? (writable.length > 0 && <UploadBox patientId={rec.patient.id} onSaved={onSaved} />)
        : writable.length > 0 && <AddEntry patientId={rec.patient.id} kinds={writable} onSaved={onSaved} />}
      {writable.length === 0 && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" />{t.readOnly}</p>}
    </div>
  );
}

function EntryList({ items }: { items: Entry[] }) {
  const { t } = useApp();
  if (!items.length) return <p className="mt-3 text-sm italic text-muted-foreground">{t.notDocumented}</p>;
  return <ul className="mt-3 space-y-2">{items.map((e) => <EntryRow key={e.id} e={e} />)}</ul>;
}

function AddEntry({ patientId, kinds, onSaved }: { patientId: string; kinds: EntryKind[]; onSaved: () => Promise<unknown> }) {
  const { t } = useApp();
  const [kind, setKind] = useState<EntryKind>(kinds[0]!);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<Record<string, string>>({});
  const statuses = STATUSES_FOR[kind];
  const effTitle = kind === "allergy" && status === "none_known" ? t.noKnownAllergies : kind === "vital" ? (title || t.kinds.vital) : title;
  const submit = () => {
    addEntry(patientId, kind, effTitle, { note, status: status || statuses?.[0] || "", detail })
      .then(() => onSaved()).then(() => { setTitle(""); setNote(""); setDetail({}); setStatus(""); toast.success("✓"); }, () => toast.error(t.readOnly));
  };
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-bold text-navy">{t.addEntry}</h2>
      {kinds.length > 1 && (
        <label className="block text-sm font-semibold">{t.entryKind}
          <select className="field mt-1" value={kind} onChange={(e) => { setKind(e.target.value as EntryKind); setStatus(""); setDetail({}); }}>
            {kinds.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
          </select>
        </label>
      )}
      {statuses && (
        <label className="block text-sm font-semibold">{t.entryStatusLbl}
          <select className="field mt-1" value={status || statuses[0]} onChange={(e) => setStatus(e.target.value)}>
            {statuses.map((s) => <option key={s} value={s}>{t.entryStatus[s as keyof typeof t.entryStatus]}</option>)}
          </select>
        </label>
      )}
      {!(kind === "allergy" && status === "none_known") && kind !== "vital" && (
        <input className="field" placeholder={t.entryTitle} aria-label={t.entryTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
      )}
      {(FIELDS[kind] ?? []).map((f) => (
        <input key={f} className="field" placeholder={t[f]} aria-label={t[f]} value={detail[f] ?? ""} onChange={(e) => setDetail({ ...detail, [f]: e.target.value })} />
      ))}
      <textarea rows={3} className="field" placeholder={t.entryNote} aria-label={t.entryNote} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn-primary w-full" disabled={!effTitle.trim()} onClick={submit}>{t.save}</button>
      <p className="text-xs text-muted-foreground">{t.manualNotice}</p>
    </section>
  );
}

function UploadBox({ patientId, onSaved }: { patientId: string; onSaved: () => Promise<unknown> }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-bold text-navy">{t.upload}</h2>
      <label className="btn btn-outline w-full cursor-pointer">
        <Upload className="size-4" /> {busy ? t.uploading : t.upload}
        <input type="file" className="sr-only" disabled={busy} accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) { toast.error(t.fileTooBig); return; }
          setBusy(true);
          uploadDocument(patientId, f).then(() => onSaved()).then(() => toast.success("✓"), () => toast.error(t.readOnly)).finally(() => setBusy(false));
        }} />
      </label>
      <p className="text-xs text-muted-foreground">PDF / PNG / JPG · {t.fileTooBig}</p>
    </section>
  );
}

function ReportsTab({ user, patientId }: { user: User; patientId: string }) {
  const { t } = useApp();
  const fmt = useFmtDate();
  const v = useStoreVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reports = useMemo(() => listReports(user).filter((r) => r.patientId === patientId), [user, patientId, v]);
  const chart = [...reports].reverse().map((r) => ({ d: new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" }), pain: r.pain }));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card p-6 lg:col-span-2">
        <h2 className="font-bold text-navy">{t.tabs.reports}</h2>
        <ul className="mt-3 space-y-2">
          {reports.length === 0 && <li className="text-sm italic text-muted-foreground">{t.noPainData}</li>}
          {reports.map((r) => (
            <li key={r.id}>
              <Link to="/reports/$id" params={{ id: r.id }} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted">
                <span className="font-mono text-sm font-semibold" dir="ltr">{r.id}</span>
                <PainPill pain={r.pain} />
                <span className="flex-1 text-sm text-muted-foreground">{r.symptoms.map((s) => t.symptoms[s]).join("، ")}</span>
                <span className="text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="font-bold text-navy">{t.painTrend}</h2>
        {chart.length < 1 ? <p className="mt-3 text-sm italic text-muted-foreground">{t.noPainData}</p> : (
          <div className="mt-4 h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="d" tick={{ fontSize: 11 }} /><YAxis domain={[0, 10]} width={28} /><Tooltip /><Line type="monotone" dataKey="pain" stroke="var(--chart-1)" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function TimelineTab({ rec, user }: { rec: Rec; user: User }) {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const v = useStoreVersion();
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const out: { at: string; kind: string; text: string; by: string; link?: string }[] = rec.entries.map((e) => ({
      at: e.recorded_at, kind: e.kind === "encounter" && e.title === "profile_update" ? t.editProfile : t.kinds[e.kind],
      text: [e.title === "profile_update" ? "" : e.title, e.note].filter(Boolean).join(" — "), by: e.created_by,
    }));
    for (const r of listReports(user).filter((x) => x.patientId === rec.patient.id)) {
      for (const a of r.activity) {
        out.push({ at: a.at, kind: `${t.kinds.report} ${r.id}`, text: [t.act[a.type], a.status ? t.status[a.status] : "", a.assigneeId ? name(userById(a.assigneeId)) : "", a.note, a.plan].filter(Boolean).join(" · "), by: a.byUserId, link: r.id });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, user, v, t]);
  const shown = items.filter((i) => `${i.kind} ${i.text} ${name(userById(i.by))}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-navy">{t.tabs.timeline}</h2>
        <input className="field max-w-xs" placeholder={t.searchHistory} aria-label={t.searchHistory} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ol className="mt-4 space-y-4 border-s-2 border-border ps-5">
        {shown.map((i, n) => (
          <li key={n} className="relative">
            <span className="absolute -start-[27px] top-1.5 size-3 rounded-full bg-primary ring-4 ring-background" />
            <p className="text-sm"><span className="me-2 rounded bg-muted px-1.5 text-xs">{i.kind}</span><strong>{name(userById(i.by))}</strong> {i.text}</p>
            {i.link && <Link to="/reports/$id" params={{ id: i.link }} className="text-xs text-primary"><FileText className="me-1 inline size-3" />{i.link}</Link>}
            <p className="text-xs text-muted-foreground">{fmt(i.at)}</p>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm italic text-muted-foreground">{t.notDocumented}</li>}
      </ol>
    </section>
  );
}
