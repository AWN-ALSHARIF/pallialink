// Medical record data access. Reads go through database row-level rules; writes through checked database functions.
import type { Json } from "@/integrations/supabase/types";

export type EntryKind = "allergy" | "medication" | "vital" | "lab" | "nursing_note" | "physician_assessment" | "care_plan" | "encounter" | "document";
export interface Profile {
  patient_id: string; mrn: string; sex: string | null; date_of_birth: string | null; language: string | null;
  primary_diagnosis: string | null; secondary_diagnoses: string[]; palliative_diagnosis: string | null; care_status: string | null;
  past_medical_history: string | null; surgical_history: string | null; family_history: string | null; social_history: string | null;
  goals_of_care: string | null; patient_preferences: string | null; is_synthetic: boolean; updated_by: string | null; updated_at: string;
}
export interface Entry {
  id: number; patient_id: string; kind: EntryKind; status: string | null; title: string;
  detail: Record<string, string | number | undefined> & { changed?: Record<string, unknown>; path?: string; name?: string };
  note: string | null; recorded_at: string; created_by: string; is_synthetic: boolean;
}
export interface PatientRow { id: string; name_ar: string; name_en: string; age: number; condition_ar: string; condition_en: string }

/** Which entry kinds each role may add (mirrors the database function). */
export const WRITABLE: Record<string, EntryKind[]> = {
  nurse: ["vital", "nursing_note", "encounter", "allergy", "document"],
  physician: ["vital", "encounter", "allergy", "document", "physician_assessment", "care_plan", "medication", "lab"],
};

async function sb() { return (await import("@/integrations/supabase/client")).supabase; }

export async function listRecordPatients(): Promise<PatientRow[]> {
  const supabase = await sb();
  const { data, error } = await supabase.from("patients").select("id,name_ar,name_en,age,condition_ar,condition_en").order("id");
  if (error) throw error;
  return data ?? [];
}

/** Returns null when the caller may not see this patient (row hidden by database rules). */
export async function loadRecord(patientId: string) {
  const supabase = await sb();
  const [{ data: patient }, { data: profile }, { data: entries, error }] = await Promise.all([
    supabase.from("patients").select("id,name_ar,name_en,age,condition_ar,condition_en").eq("id", patientId).maybeSingle(),
    supabase.from("patient_profiles").select("*").eq("patient_id", patientId).maybeSingle(),
    supabase.from("clinical_entries").select("id,patient_id,kind,status,title,detail,note,recorded_at,created_by,is_synthetic").eq("patient_id", patientId).order("recorded_at", { ascending: false }).limit(500),
  ]);
  if (error) throw error;
  if (!patient) return null;
  void supabase.rpc("emr_log_access", { p_patient: patientId, p_action: "view_record" });
  return { patient: patient as PatientRow, profile: (profile as Profile | null) ?? null, entries: (entries ?? []) as unknown as Entry[] };
}

export async function addEntry(patientId: string, kind: EntryKind, title: string, opts: { note?: string; status?: string; detail?: Record<string, string> } = {}) {
  const supabase = await sb();
  const detail = Object.fromEntries(Object.entries(opts.detail ?? {}).filter(([, v]) => v.trim() !== ""));
  const { error } = await supabase.rpc("emr_add_entry", {
    p_patient: patientId, p_kind: kind, p_title: title, p_detail: detail as Json,
    ...(opts.note?.trim() ? { p_note: opts.note.trim() } : {}), ...(opts.status ? { p_status: opts.status } : {}),
  });
  if (error) throw new Error("forbidden");
}

export async function updateProfile(patientId: string, fields: Record<string, string | string[] | null>) {
  const supabase = await sb();
  const { error } = await supabase.rpc("emr_update_profile", { p_patient: patientId, p_fields: fields as Json });
  if (error) throw new Error("forbidden");
}

export async function uploadDocument(patientId: string, file: File) {
  const supabase = await sb();
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${patientId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from("clinical-documents").upload(path, file, { upsert: false });
  if (error) throw error;
  await addEntry(patientId, "document", file.name.slice(0, 200), { detail: { path, name: file.name, size: String(file.size) } });
}

export async function openDocument(patientId: string, path: string) {
  const supabase = await sb();
  const { data, error } = await supabase.storage.from("clinical-documents").createSignedUrl(path, 60);
  if (error || !data) throw error ?? new Error("forbidden");
  void supabase.rpc("emr_log_access", { p_patient: patientId, p_action: "view_document", p_section: path.slice(0, 50) });
  window.open(data.signedUrl, "_blank", "noopener");
}
