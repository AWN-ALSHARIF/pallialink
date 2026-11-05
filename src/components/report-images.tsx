import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "@/lib/app";
import { decodeImage, replaceImage, type ReportImage } from "@/lib/report-media";
import { reportImageUrl } from "@/lib/store";

function Preview({ file, label }: { file: File; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
  return url ? <img src={url} alt={label} className="aspect-square w-full rounded-md object-contain bg-muted" /> : null;
}
export function ReportImagePicker({ value, onChange, disabled, onValidatingChange }: { value: File[]; onChange: (files: File[]) => void; disabled: boolean; onValidatingChange?: (pending: boolean) => void }) {
  const { t } = useApp(); const m = t.media;
  const add = useRef<HTMLInputElement>(null); const replacement = useRef<HTMLInputElement>(null);
  const index = useRef(0); const [error, setError] = useState(false); const [validating, setValidating] = useState(false);
  async function accept(files: File[], replacing: boolean) {
    if (disabled || validating || !files.length) return;
    setError(false); setValidating(true); onValidatingChange?.(true);
    try { for (const file of files) await decodeImage(file); onChange(replacing && files[0] ? replaceImage(value, index.current, files[0]) : [...value, ...files]); }
    catch { setError(true); } finally { setValidating(false); onValidatingChange?.(false); }
  }
  return <section className="card p-6"><h2 className="text-lg font-bold">{m.title}</h2>
    <input ref={add} aria-label={m.add} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { void accept(Array.from(e.target.files ?? []), false); e.target.value = ""; }} />
    <input ref={replacement} aria-label={m.replace} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { void accept(Array.from(e.target.files ?? []), true); e.target.value = ""; }} />
    <Button variant="outline" disabled={disabled || validating} className="mt-4 min-h-12" onClick={() => add.current?.click()}><ImagePlus />{m.add}</Button>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{value.map((file, i) => <div key={i} className="min-w-0"><Preview file={file} label={`${m.image} ${i + 1}`} /><p className="mt-2 truncate text-sm">{file.name}</p><div className="mt-2 flex gap-2"><Button size="icon" variant="outline" title={m.replace} aria-label={`${m.replace} ${i + 1}`} disabled={disabled || validating} onClick={() => { index.current = i; replacement.current?.click(); }}><RefreshCw /></Button><Button size="icon" variant="outline" title={m.remove} aria-label={`${m.remove} ${i + 1}`} disabled={disabled || validating} onClick={() => onChange(value.filter((_, j) => i !== j))}><Trash2 /></Button></div></div>)}</div>
    {validating && <p role="status">{t.access.loading}</p>}{error && <p role="alert" className="mt-3 text-destructive">{m.invalid}</p>}
  </section>;
}
function StoredImage({ image, number }: { image: ReportImage; number: number }) {
  const { t } = useApp(); const [url, setUrl] = useState(""); const [error, setError] = useState(false);
  async function open() { try { const fresh = await reportImageUrl(image.path); window.open(fresh, "_blank", "noopener,noreferrer"); } catch { setError(true); } }
  useEffect(() => { let active = true; reportImageUrl(image.path).then(value => { if (active) setUrl(value); }, () => { if (active) setError(true); }); return () => { active = false; }; }, [image.path]);
  return <div className="min-w-0">{url && <img src={url} alt={`${t.media.image} ${number}`} onError={() => setError(true)} className="aspect-square w-full rounded-md bg-muted object-contain" />}{error && <p role="alert">{t.media.load}</p>}<Button variant="outline" className="mt-2 w-full whitespace-normal" onClick={() => void open()}><ExternalLink />{t.media.open} {number}</Button></div>;
}
export function ReportImageGallery({ images }: { images?: ReportImage[] | undefined }) {
  const { t } = useApp(); if (!images?.length) return null;
  return <section className="mt-6"><h2 className="text-lg font-bold text-navy">{t.media.title}</h2><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{[...images].sort((a,b) => a.position - b.position).map((image,i) => <StoredImage key={image.id} image={image} number={i+1} />)}</div></section>;
}