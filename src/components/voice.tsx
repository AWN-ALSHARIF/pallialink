import { Mic, Square, Trash2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/app";
import { AUDIO_MAX_BYTES, AUDIO_MAX_S, reportAudioUrl } from "@/lib/store";
import { Button } from "./ui/button";

export type Recording = { blob: Blob; durationS: number };

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

export function VoiceRecorder({ value, onChange, onRecordingChange }: { value: Recording | null; onChange: (r: Recording | null) => void; onRecordingChange?: (recording: boolean) => void }) {
  const { t } = useApp();
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const start = useRef(0);
  useEffect(() => { onRecordingChange?.(recording); return () => onRecordingChange?.(false); }, [recording, onRecordingChange]);

  useEffect(() => {
    if (!value) { setUrl(null); return; }
    const u = URL.createObjectURL(value.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.state === "recording" && rec.current.stop(); }, []);

  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const begin = async () => {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { setErr(t.voice.unsupported); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setErr(t.voice.denied); return; }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      const blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
      const d = Math.min(AUDIO_MAX_S, (Date.now() - start.current) / 1000);
      if (blob.size > AUDIO_MAX_BYTES) { setErr(t.voice.uploadErr); return; }
      if (d >= 1) onChange({ blob, durationS: d });
    };
    rec.current = mr;
    start.current = Date.now();
    setSecs(0);
    mr.start();
    setRecording(true);
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - start.current) / 1000);
      setSecs(s);
      if (s >= AUDIO_MAX_S) stop();
    }, 250);
  };

  return (
    <div>
      <h2 className="text-lg font-bold">{t.voice.title}</h2>
      <p className="mt-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">{t.voice.warn}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!value && !recording && <Button type="button" variant="outline" onClick={begin} className="min-h-12"><Mic className="size-5" /> {t.voice.record}</Button>}
        {recording && (
          <>
            <Button type="button" onClick={stop} className="min-h-12"><Square className="size-5" /> {t.voice.stop}</Button>
            <span className="flex items-center gap-2 font-mono font-bold text-destructive" dir="ltr" aria-live="polite"><span className="size-2.5 animate-pulse rounded-full bg-destructive" />{t.voice.recording} {secs}/{AUDIO_MAX_S}{t.voice.sec}</span>
          </>
        )}
        {value && url && (
          <>
            <audio aria-label={t.voice.title} controls src={url} className="max-w-full" />
            <span className="text-sm text-muted-foreground">{t.voice.duration}: <span dir="ltr">{Math.round(value.durationS)}{t.voice.sec}</span></span>
            <Button type="button" variant="outline" onClick={() => onChange(null)} className="min-h-11"><Trash2 className="size-4" /> {t.voice.del}</Button>
          </>
        )}
      </div>
      {!value && !recording && <p className="mt-2 text-xs text-muted-foreground">{t.voice.max}</p>}
      {err && <p className="mt-2 text-sm text-destructive" role="alert">{err}</p>}
    </div>
  );
}

export function VoicePlayer({ path, durationS }: { path: string; durationS?: number | undefined }) {
  const { t } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let on = true; reportAudioUrl(path).then((u) => on && setUrl(u), () => on && setErr(true)); return () => { on = false; }; }, [path]);
  return (
    <section className="card border-primary/40 p-6">
      <h2 className="flex items-center gap-2 font-bold text-navy"><Volume2 className="size-5 text-primary" /> {t.voice.patientVoice}</h2>
      {durationS != null && <p className="mt-1 text-sm text-muted-foreground">{t.voice.duration}: <span dir="ltr">{durationS}{t.voice.sec}</span></p>}
      {err ? <p className="mt-3 text-sm text-destructive" role="alert">{t.voice.loadErr}</p> : url ? <audio aria-label={t.voice.patientVoice} controls src={url} className="mt-3 w-full" /> : <div className="mt-3 h-12 animate-pulse rounded-lg bg-muted" />}
    </section>
  );
}
