import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Droplets, Utensils, Pill, Bath, Moon, Wind, Frown, HeartHandshake, HandHelping, Send, X, Volume2, Square, Mic } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "@/lib/app";
import { patientFeatures, usePatientAccess } from "@/lib/patient-access";
import { submitReport } from "@/lib/store";

const icons = { pain: Activity, water: Droplets, food: Utensils, medication: Pill, bathroom: Bath, sleep: Moon, breathing: Wind, nausea: Frown, anxiety: HeartHandshake, assistance: HandHelping };
type Request = keyof typeof icons;
export function ReadAloud() {
  const { lang, t: { access: a } } = useApp();
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => { setReading(false); setNotice(""); return () => { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel(); }; }, [lang]);
  async function read() {
    if (!("speechSynthesis" in window)) { setNotice(a.speechUnsupported); return; }
    const synth = window.speechSynthesis;
    if (reading) { synth.cancel(); setReading(false); setNotice(""); return; }
    let voices = synth.getVoices();
    if (!voices.length) { await new Promise((resolve) => setTimeout(resolve, 500)); voices = synth.getVoices(); }
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang));
    if (!voice) { setNotice(a.speechNoVoice); return; }
    const text = document.getElementById("patient-content")?.innerText;
    if (!text) return;
    synth.cancel();
    const item = new SpeechSynthesisUtterance(text);
    item.lang = lang === "ar" ? "ar-SA" : "en-GB"; item.voice = voice;
    item.onend = () => { setReading(false); setNotice(a.speechFinished); };
    item.onerror = () => { setReading(false); setNotice(a.speechError); };
    utterance.current = item; setReading(true); setNotice(a.reading); synth.speak(item);
  }
  return <div><Button variant="outline" className="min-h-12" onClick={() => void read()}>{reading ? <Square /> : <Volume2 />}{reading ? a.stopReading : a.readAloud}</Button><p role="status" className="mt-2 text-sm">{notice}</p></div>;
}
export function PatientCommunication() {
  const { user, t, lang } = useApp();
  const { draft, loading, failed, reload } = usePatientAccess();
  const features = patientFeatures(draft); const a = t.access;
  const [selected, setSelected] = useState<Request | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; request: Request } | null>(null);
  const [error, setError] = useState(false); const titleId = useId(); const requestRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (selected) requestRef.current?.focus(); }, [selected]);
  async function send() {
    if (!user || user.role !== "patient" || !selected || pain === null || busy) return;
    setBusy(true); setError(false);
    try {
      const report = await submitReport(user, { pain, symptoms: [], notes: `${a.requestPrefix}: ${a.pictograms[selected]}\nPatient-selected communication request: ${selected}` });
      setResult({ id: report.id, request: selected }); setSelected(null); setPain(null);
    } catch { setError(true); } finally { setBusy(false); }
  }
  if (user?.role !== "patient") return null;
  return <section className="mt-6 space-y-4" aria-labelledby={titleId}>
    {loading && <p role="status">{a.loading}</p>}
    {failed && <div role="alert"><p>{a.portalLoadError}</p><Button variant="outline" onClick={() => void reload()}>{a.retry}</Button></div>}
    {features.tts && <ReadAloud />}
    {features.voice && <Button asChild variant="outline" className="min-h-14"><Link to="/report"><Mic />{a.voiceLink}</Link></Button>}
    {features.pictures && <><h2 id={titleId} className="text-xl font-bold text-navy">{a.boardTitle}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{(Object.keys(icons) as Request[]).map((key) => { const Icon = icons[key]; return <Button key={key} variant="outline" aria-pressed={selected === key} disabled={busy} className="h-auto min-h-32 flex-col whitespace-normal p-4 text-base" onClick={() => { setResult(null); setError(false); setPain(null); setSelected(key); }}><Icon aria-hidden="true" className="size-10 text-primary" strokeWidth={1.8} /><span>{a.pictograms[key]}</span></Button>; })}</div>
      {selected && <div ref={requestRef} tabIndex={-1} className="border-y py-5 outline-none" aria-label={`${a.selectedRequest}: ${a.pictograms[selected]}`}>
        <h3 className="text-lg font-bold">{a.selectedRequest}: {a.pictograms[selected]}</h3><p className="mt-2">{a.requestPainHint}</p>
        <fieldset disabled={busy} className="mt-4"><legend className="font-semibold">{t.painLevel}</legend><div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-11">{Array.from({ length: 11 }, (_, i) => <label key={i} className="flex min-h-14 items-center justify-center gap-2 rounded-md border text-lg"><input type="radio" name={`request-pain-${titleId}`} value={i} checked={pain === i} onChange={() => setPain(i)} className="size-5 accent-primary" />{i}</label>)}</div></fieldset>
        <div className="mt-4 flex flex-wrap gap-3"><Button disabled={busy || pain === null} className="min-h-14" onClick={() => void send()}><Send />{busy ? a.saving : a.sendRequest}</Button><Button variant="outline" disabled={busy} onClick={() => { setSelected(null); setPain(null); }}><X />{a.cancelRequest}</Button></div>
      </div>}
    </>}
    {result && <p role="status" className="border-s-4 border-primary p-4 font-semibold">{a.requestSent}: {a.pictograms[result.request]} · <span dir="ltr">{result.id}</span></p>}
    {error && <p role="alert" className="text-destructive">{a.requestError}</p>}
  </section>;
}