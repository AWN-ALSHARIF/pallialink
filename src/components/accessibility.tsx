import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Accessibility, Check, Lock, Pencil, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, useFmtDate, useName } from "@/lib/app";
import { userById } from "@/lib/store";
import {
  ACCESSIBILITY_NEEDS, COMMUNICATION_METHODS, INTERFACE_FLAGS, PATIENT_FLAGS,
  emptyAccessibility, emptyPersonal, loadAccessibility, loadPersonal, personalDraft, profileDraft,
  saveAccessibility, savePersonal, type AccessibilityDraft, type InterfacePreferences, type PersonalDraft,
} from "@/lib/accessibility";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="min-w-0 border-t py-5"><legend className="px-0 pt-4 text-base font-bold text-navy">{title}</legend><div className="mt-2">{children}</div></fieldset>;
}
function Choices<K extends string>({ values, labels, selected, onChange }: { values: readonly K[]; labels: Record<K, string>; selected: K[]; onChange: (v: K[]) => void }) {
  return <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{values.map((v) => <label key={v} className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={selected.includes(v)} onChange={(e) => onChange(e.target.checked ? [...selected, v] : selected.filter((x) => x !== v))} /><span>{labels[v]}</span></label>)}</div>;
}
function Methods({ draft, onChange }: { draft: Pick<PersonalDraft, "communication_methods" | "primary_method">; onChange: (v: Pick<PersonalDraft, "communication_methods" | "primary_method">) => void }) {
  const { t: { access: a } } = useApp();
  return <Section title={a.methodsTitle}><Choices values={COMMUNICATION_METHODS} labels={a.methods} selected={draft.communication_methods} onChange={(methods) => onChange({ communication_methods: methods, primary_method: draft.primary_method && methods.includes(draft.primary_method) ? draft.primary_method : null })} />
    <label className="mt-4 block text-sm font-semibold">{a.primary}<select aria-label={a.primary} className="field mt-2 max-w-lg" value={draft.primary_method ?? ""} onChange={(e) => { const method = COMMUNICATION_METHODS.find((m) => m === e.target.value); onChange({ ...draft, primary_method: method ?? null }); }}><option value="">{a.none}</option>{draft.communication_methods.map((v) => <option value={v} key={v}>{a.methods[v]}</option>)}</select></label>
  </Section>;
}
function InterfaceFields({ value, onChange, personal }: { value: InterfacePreferences; onChange: (v: InterfacePreferences) => void; personal: boolean }) {
  const { t: { access: a } } = useApp();
  const flags = personal ? PATIENT_FLAGS : INTERFACE_FLAGS;
  return <Section title={a.interfaceTitle}><div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-semibold">{a.textSize}<select aria-label={a.textSize} className="field mt-2" value={value.text_size ?? ""} onChange={(e) => { const size = e.target.value; onChange({ ...value, text_size: size === "standard" || size === "large" || size === "extra_large" ? size : undefined }); }}><option value="">{a.notSet}</option>{Object.entries(a.sizes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label className="text-sm font-semibold">{a.contrast}<select aria-label={a.contrast} className="field mt-2" value={value.contrast ?? ""} onChange={(e) => { const contrast = e.target.value; onChange({ ...value, contrast: contrast === "standard" || contrast === "high" ? contrast : undefined }); }}><option value="">{a.notSet}</option>{Object.entries(a.contrasts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
  </div><div className="mt-3 grid gap-x-6 sm:grid-cols-2">{flags.map((key) => <label key={key} className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={value[key] === true} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />{a.flags[key]}</label>)}</div></Section>;
}
function ReviewFields({ draft, onChange }: { draft: AccessibilityDraft; onChange: (v: AccessibilityDraft) => void }) {
  const { t: { access: a } } = useApp();
  return <Section title={a.reviewTitle}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">{a.reviewStatus}<select aria-label={a.reviewStatus} className="field mt-2" value={draft.review_status} onChange={(e) => { const status = e.target.value; if (status === "reviewed" || status === "not_reviewed" || status === "review_requested") onChange({ ...draft, review_status: status }); }}>{Object.entries(a.review).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="text-sm font-semibold">{a.nextReview}<input className="field mt-2" type="date" value={draft.next_review_date ?? ""} onChange={(e) => onChange({ ...draft, next_review_date: e.target.value || null })} /></label></div></Section>;
}
function PreferenceSummary({ draft, personal }: { draft: AccessibilityDraft | PersonalDraft; personal: boolean }) {
  const { t: { access: a }, lang } = useApp();
  const support = "needs" in draft ? draft : null;
  const prefs: InterfacePreferences = "preferences" in draft ? draft.preferences : draft.interface_preferences;
  const list = (values: string[]) => values.length ? values.join(lang === "ar" ? "، " : ", ") : a.notSet;
  return <div className="space-y-4 text-sm">
    {support && <div><h3 className="font-semibold text-muted-foreground">{a.needsTitle}</h3><p className="mt-1">{list(support.needs.map((n) => a.needs[n]))}</p>{support.other_need && <p className="mt-1 whitespace-pre-wrap break-words">{support.other_need}</p>}</div>}
    <div><h3 className="font-semibold text-muted-foreground">{a.methodsTitle}</h3><p className="mt-1">{list(draft.communication_methods.map((m) => a.methods[m]))}</p><p className="mt-1">{a.primary}: {draft.primary_method ? a.methods[draft.primary_method] : a.none}</p></div>
    <div><h3 className="font-semibold text-muted-foreground">{a.interfaceTitle}</h3><dl className="mt-2 grid gap-2 sm:grid-cols-2"><div><dt className="inline">{a.textSize}: </dt><dd className="inline">{prefs.text_size ? a.sizes[prefs.text_size] : a.notSet}</dd></div><div><dt className="inline">{a.contrast}: </dt><dd className="inline">{prefs.contrast ? a.contrasts[prefs.contrast] : a.notSet}</dd></div>{(personal ? PATIENT_FLAGS : INTERFACE_FLAGS).map((key) => <div key={key}><dt className="inline">{a.flags[key]}: </dt><dd className="inline">{prefs[key] === undefined ? a.notSet : prefs[key] ? a.yes : a.no}</dd></div>)}</dl></div>
    {support && <><div><h3 className="font-semibold text-muted-foreground">{a.notesTitle}</h3><p className="mt-1 whitespace-pre-wrap break-words">{support.support_notes || a.notSet}</p></div><p>{a.reviewStatus}: {a.review[support.review_status]} · {a.nextReview}: {support.next_review_date ?? a.notSet}</p></>}
  </div>;
}

export function AccessibilityPanel({ patientId, personal = false }: { patientId: string; personal?: boolean }) {
  const { t: { access: a }, user } = useApp();
  const fmt = useFmtDate(); const name = useName(); const formId = useId();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAccessibility>> | null>(null);
  const [own, setOwn] = useState<Awaited<ReturnType<typeof loadPersonal>>>(null);
  const [draft, setDraft] = useState<AccessibilityDraft>(emptyAccessibility);
  const [personalForm, setPersonalForm] = useState<PersonalDraft>(emptyPersonal);
  const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"saved" | "error" | "conflict" | null>(null);
  const generation = useRef(0);
  const activeForm = useRef(false);
  activeForm.current = edit || busy;
  const reload = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setFailed(false); setEdit(false); setData(null); setOwn(null);
    try { if (personal) { const row = await loadPersonal(patientId); if (version !== generation.current) return; setOwn(row); setPersonalForm(personalDraft(row)); }
      else { const loaded = await loadAccessibility(patientId); if (version !== generation.current) return; setData(loaded); setDraft(profileDraft(loaded.profile)); }
    } catch { if (version === generation.current) setFailed(true); } finally { if (version === generation.current) setLoading(false); }
  }, [patientId, personal, user?.id]);
  useEffect(() => { void reload(); const focus = () => { if (!activeForm.current) void reload(); }; window.addEventListener("focus", focus); return () => { generation.current++; window.removeEventListener("focus", focus); }; }, [reload]);
  // Clear on identity change; reject delayed session results by remounting this panel at its call sites.
  const row = personal ? own : data?.profile;
  const canEdit = personal ? user?.role === "patient" && user.patientId === patientId : data?.canEdit === true;
  async function submit() {
    setBusy(true); setNotice(null);
    try { if (personal) await savePersonal(patientId, personalForm, own?.revision ?? 0); else await saveAccessibility(patientId, draft, data?.profile?.revision ?? 0); await reload(); setNotice("saved"); }
    catch (e) { setNotice(e instanceof Error && e.message === "conflict" ? "conflict" : "error"); }
    finally { setBusy(false); }
  }
  return <section className="min-w-0 py-5" aria-labelledby={formId}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={formId} className="flex items-center gap-2 text-xl font-bold text-navy"><Accessibility className="size-5 shrink-0 text-primary" />{personal ? a.personalTitle : a.title}</h2>{!loading && !failed && !edit && canEdit && <Button variant="outline" className="min-h-11" onClick={() => { setNotice(null); setEdit(true); }}><Pencil />{a.edit}</Button>}</div>
    {loading ? <p className="mt-5 text-muted-foreground" role="status">{a.loading}</p> : failed ? <div className="mt-5"><p role="alert">{a.unavailable}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void reload()}><RotateCcw />{a.retry}</Button></div> : <>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className={row ? "font-semibold text-primary" : ""}>{row ? a.configured : a.unconfigured}</span>{row && <span>{a.updatedAt}: {fmt(row.updated_at)} · {a.updatedBy}: {name(userById(row.updated_by))}</span>}</div>
      {!canEdit && <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" />{a.readOnly}</p>}
      {notice && <p className={`mt-4 flex items-center gap-2 text-sm ${notice === "saved" ? "text-primary" : "text-destructive"}`} role={notice === "saved" ? "status" : "alert"}>{notice === "saved" && <Check className="size-4" />}{a[notice]}</p>}
      {notice === "conflict" && <Button className="mt-3 min-h-11" variant="outline" onClick={() => { setNotice(null); void reload(); }}><RotateCcw />{a.reload}</Button>}
      {edit ? <form className="mt-5" onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset disabled={busy || !canEdit || notice === "conflict"} className="min-w-0">
        {!personal && <Section title={a.needsTitle}><Choices values={ACCESSIBILITY_NEEDS} labels={a.needs} selected={draft.needs} onChange={(needs) => setDraft({ ...draft, needs, other_need: needs.includes("other") ? draft.other_need : null })} />{draft.needs.includes("other") && <label className="mt-4 block text-sm font-semibold">{a.otherDescription}<input className="field mt-2" maxLength={500} value={draft.other_need ?? ""} onChange={(e) => setDraft({ ...draft, other_need: e.target.value || null })} /></label>}</Section>}
        <Methods draft={personal ? personalForm : draft} onChange={(fields) => personal ? setPersonalForm({ ...personalForm, ...fields }) : setDraft({ ...draft, ...fields })} />
        <InterfaceFields personal={personal} value={personal ? personalForm.preferences : draft.interface_preferences} onChange={(value) => personal ? setPersonalForm({ ...personalForm, preferences: value }) : setDraft({ ...draft, interface_preferences: value })} />
        {!personal && <><Section title={a.notesTitle}><label className="block text-sm font-semibold">{a.supportNotes}<textarea className="field mt-2 font-normal" rows={3} maxLength={2000} value={draft.support_notes ?? ""} onChange={(e) => setDraft({ ...draft, support_notes: e.target.value || null })} /></label></Section><ReviewFields draft={draft} onChange={setDraft} /></>}
      </fieldset><div className="mt-5 flex flex-wrap gap-3"><Button type="submit" className="min-h-12" disabled={busy || !canEdit || notice === "conflict"}><Save />{busy ? a.saving : a.save}</Button><Button type="button" variant="outline" className="min-h-12" disabled={busy} onClick={() => { setNotice(null); void reload(); }}>{a.cancel}</Button></div></form>
        : <div className="mt-5"><PreferenceSummary draft={personal ? personalDraft(own) : profileDraft(data?.profile ?? null)} personal={personal} /></div>}
      {!personal && data && <>
        <div className="mt-8 border-t pt-5"><h3 className="mb-4 text-base font-bold text-navy">{a.personalSection}</h3><PreferenceSummary draft={personalDraft(data.personal)} personal /></div>
        <div className="mt-8 border-t pt-5"><h3 className="text-base font-bold text-navy">{a.history}</h3>{!data.history.length && <p className="mt-3 text-sm text-muted-foreground">{a.noHistory}</p>}
          <ol className="mt-3 divide-y">{data.history.map((entry) => <li key={entry.id} className="py-4"><p className="text-sm font-semibold">{name(userById(entry.actor_id))} · {entry.source === "staff_profile" ? a.staffTitle : a.personalSection}</p><p className="mt-1 text-xs text-muted-foreground">{fmt(entry.at)}</p><details className="mt-3 text-sm"><summary className="cursor-pointer text-primary">{a.details}</summary><div className="mt-3 grid gap-5 md:grid-cols-2">{(["old_value", "new_value"] as const).map((key) => <div key={key}><h4 className="mb-3 font-bold">{key === "old_value" ? a.before : a.after}</h4>{entry[key] === null ? <p>{a.notSet}</p> : entry.source === "staff_profile" ? <PreferenceSummary draft={profileDraft(entry[key] as unknown as Parameters<typeof profileDraft>[0])} personal={false} /> : <PreferenceSummary draft={personalDraft(entry[key] as unknown as Parameters<typeof personalDraft>[0])} personal />}</div>)}</div></details></li>)}</ol>
        </div></>}
    </>}
  </section>;
}
