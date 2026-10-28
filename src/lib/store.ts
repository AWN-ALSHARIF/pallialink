// Data layer backed by the Lovable Cloud database. Synthetic demo data only.
// UI depends only on these functions.

export type Role = "patient" | "caregiver" | "nurse" | "physician" | "admin";
export type Status = "submitted" | "acknowledged" | "awaiting_physician" | "under_review" | "follow_up" | "returned_to_nursing" | "nursing_follow_up" | "closed";
export const STATUSES: Status[] = ["submitted", "acknowledged", "awaiting_physician", "under_review", "follow_up", "returned_to_nursing", "nursing_follow_up", "closed"];
export const SYMPTOMS = ["nausea", "fatigue", "breathlessness", "sleep", "other"] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export interface User {
  id: string;
  role: Role;
  nameAr: string;
  nameEn: string;
  patientId?: string | undefined; // patient self, or caregiver's linked patient
  canApproveClosure?: boolean; // physicians authorized to approve clinical closure
}
export interface Patient {
  id: string;
  nameAr: string;
  nameEn: string;
  age: number;
  conditionAr: string;
  conditionEn: string;
  careTeam: string[]; // clinician user ids
}
export interface Activity {
  at: string;
  byUserId: string;
  type: "created" | "status" | "assigned" | "note" | "nursing_obs" | "assessment" | "escalated" | "returned" | "return_ack" | "closure_approved";
  status?: Status | undefined;
  assigneeId?: string | undefined;
  note?: string | undefined;
  plan?: string | undefined;
}
export interface Report {
  id: string;
  patientId: string;
  submittedBy: string;
  createdAt: string;
  pain: number;
  symptoms: Symptom[];
  notes: string;
  status: Status;
  assigneeId?: string | undefined;
  nurseAckBy?: string | undefined;
  nurseAckAt?: string | undefined;
  physicianAckBy?: string | undefined;
  physicianAckAt?: string | undefined;
  returnedBy?: string | undefined;
  returnedAt?: string | undefined;
  returnReason?: string | undefined;
  returnAckBy?: string | undefined;
  returnAckAt?: string | undefined;
  audioPath?: string | undefined;
  audioDurationS?: number | undefined;
  activity: Activity[];
}
interface DB { reports: Report[]; seq: number }

export const USERS: User[] = [
  { id: "u-pat", role: "patient", nameAr: "رنا عبدالعزيز", nameEn: "Rana Abdulaziz", patientId: "p1" },
  { id: "u-pat2", role: "patient", nameAr: "عبدالله ناصر", nameEn: "Abdullah Nasser", patientId: "p2" },
  { id: "u-pat3", role: "patient", nameAr: "سارة محمد", nameEn: "Sara Mohammed", patientId: "p3" },
  { id: "u-cg", role: "caregiver", nameAr: "طارق عبدالله", nameEn: "Tariq Abdullah", patientId: "p1" },
  { id: "u-nurse", role: "nurse", nameAr: "الياس فارس", nameEn: "Elias Fares" },
  { id: "u-doc", role: "physician", nameAr: "منوال خالد", nameEn: "Manwal Khaled", canApproveClosure: true },
  { id: "u-doc2", role: "physician", nameAr: "ريما سالم", nameEn: "Reema Salem" },
  { id: "u-xnurse", role: "nurse", nameAr: "تالين زياد", nameEn: "Taleen Ziyad" },
  { id: "u-admin", role: "admin", nameAr: "عون الشريف", nameEn: "Awn Alsharif" },
];

export const PATIENTS: Patient[] = [
  { id: "p1", nameAr: "رنا عبدالعزيز", nameEn: "Rana Abdulaziz", age: 64, conditionAr: "سرطان رئة متقدم", conditionEn: "Advanced lung cancer", careTeam: ["u-nurse", "u-doc"] },
  { id: "p2", nameAr: "عبدالله ناصر", nameEn: "Abdullah Nasser", age: 68, conditionAr: "قصور قلب متقدم", conditionEn: "Advanced heart failure", careTeam: ["u-nurse", "u-doc"] },
  { id: "p3", nameAr: "سارة محمد", nameEn: "Sara Mohammed", age: 57, conditionAr: "مرض عصبي متقدم", conditionEn: "Advanced neurological disease", careTeam: ["u-nurse", "u-doc2"] },
];

export const CLINICIANS = USERS.filter((u) => u.role === "nurse" || u.role === "physician");
export const isClinical = (r: Role) => r === "nurse" || r === "physician" || r === "admin";

// ---- Persistent source of truth: Lovable Cloud database ----
// The in-memory cache below is only a mirror of the database, refreshed after every write.
// It is never written back wholesale, so a stale tab can no longer overwrite newer data.
let cache: DB = { reports: [], seq: 0 };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
/** Test hook: inject reports without a database. */
export const __setReportsForTest = (reports: Report[]) => { cache = { reports, seq: 0 }; notify(); };

async function sb() { return (await import("@/integrations/supabase/client")).supabase; }

let inflight: Promise<void> | null = null;
let lastRefresh = 0;
/** Reload from the database; concurrent calls share one request. */
export function refresh(): Promise<void> {
  if (!inflight) inflight = doRefresh().finally(() => { inflight = null; lastRefresh = Date.now(); });
  return inflight;
}
/** Focus-triggered reload, skipped if data is fresher than 15 s. */
export function refreshIfStale() { return Date.now() - lastRefresh < 15000 ? Promise.resolve() : refresh(); }
async function doRefresh() {
  const supabase = await sb();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) { cache = { reports: [], seq: 0 }; notify(); return; }
  const [{ data: reps, error: e1 }, { data: acts, error: e2 }] = await Promise.all([
    supabase.from("reports").select("*"),
    supabase.from("report_activity").select("*").order("id"),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const byReport = new Map<string, Activity[]>();
  for (const a of acts ?? []) {
    const list = byReport.get(a.report_id) ?? [];
    list.push({ at: a.at, byUserId: a.by_user_id, type: a.type as Activity["type"], status: (a.status ?? undefined) as Status | undefined, assigneeId: a.assignee_id ?? undefined, note: a.note ?? undefined, plan: a.plan ?? undefined });
    byReport.set(a.report_id, list);
  }
  cache = {
    seq: 0,
    reports: (reps ?? []).map((r) => ({
      id: r.id, patientId: r.patient_id, submittedBy: r.submitted_by, createdAt: r.created_at, pain: r.pain,
      symptoms: r.symptoms as Symptom[], notes: r.notes, status: r.status as Status, assigneeId: r.assignee_id ?? undefined,
      nurseAckBy: r.nurse_ack_by ?? undefined, nurseAckAt: r.nurse_ack_at ?? undefined, physicianAckBy: r.physician_ack_by ?? undefined, physicianAckAt: r.physician_ack_at ?? undefined,
      returnedBy: r.returned_by ?? undefined, returnedAt: r.returned_at ?? undefined, returnReason: r.return_reason ?? undefined, returnAckBy: r.return_ack_by ?? undefined, returnAckAt: r.return_ack_at ?? undefined,
      audioPath: r.audio_path ?? undefined, audioDurationS: r.audio_duration_s ?? undefined,
      activity: byReport.get(r.id) ?? [],
    })),
  };
  notify();
}
const load = () => cache;

export async function resetDemo() {
  const supabase = await sb();
  const { error } = await supabase.rpc("reset_demo");
  if (error) throw error;
  await refresh();
}

/** Sign in as a demo persona (real backend account) and return its persona id. */
export async function signInAs(personaId: string) {
  const { demoSignIn } = await import("./demo-auth.functions");
  const tokens = await demoSignIn({ data: { personaId } });
  const supabase = await sb();
  const { error } = await supabase.auth.setSession(tokens);
  if (error) throw error;
  await refresh();
}
export async function signOut() {
  const supabase = await sb();
  await supabase.auth.signOut();
  cache = { reports: [], seq: 0 };
  notify();
}
/** Persona of the current backend session, if any. */
export async function currentPersonaId(): Promise<string | null> {
  const supabase = await sb();
  // Local session read (no network); the database re-validates the token on every query.
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const { data: row } = await supabase.from("app_users").select("persona_id").eq("auth_id", uid).maybeSingle();
  return row?.persona_id ?? null;
}

// ---- Access control (enforced inside every store function, not just in the UI) ----
export const NURSES = USERS.filter((u) => u.role === "nurse");
export const PHYSICIANS = USERS.filter((u) => u.role === "physician");

export function canViewPatient(user: User, patientId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "patient" || user.role === "caregiver") return user.patientId === patientId;
  if (user.role === "physician") {
    return load().reports.some((r) => r.patientId === patientId && (r.assigneeId === user.id || r.physicianAckBy === user.id));
  }
  return PATIENTS.find((p) => p.id === patientId)?.careTeam.includes(user.id) ?? false;
}
export const isAssignedTo = (user: User, r: Report) => r.assigneeId === user.id;

export type Action = "nurseAck" | "returnAck" | "nursingObs" | "escalate" | "physAck" | "assessment" | "returnToNursing" | "approveClosure" | "adminAssign";
/** Single source of truth for which role may do what on a report. */
export function can(user: User, action: Action, r: Report): boolean {
  if (!canViewReport(user, r)) return false;
  const open = r.status !== "closed";
  switch (action) {
    case "nurseAck": return user.role === "nurse" && r.status === "submitted";
    case "returnAck": return user.role === "nurse" && isAssignedTo(user, r) && r.status === "returned_to_nursing";
    case "nursingObs": return user.role === "nurse" && open;
    case "escalate": return user.role === "nurse" && (r.status === "acknowledged" || r.status === "awaiting_physician" || r.status === "nursing_follow_up");
    case "physAck": return user.role === "physician" && isAssignedTo(user, r) && r.status === "awaiting_physician";
    case "assessment": return user.role === "physician" && isAssignedTo(user, r) && (r.status === "under_review" || r.status === "follow_up");
    case "returnToNursing": return user.role === "physician" && isAssignedTo(user, r) && (r.status === "under_review" || r.status === "follow_up");
    case "approveClosure": return user.role === "physician" && !!user.canApproveClosure && isAssignedTo(user, r) && r.status === "follow_up";
    case "adminAssign": return user.role === "admin" && open;
  }
}

export function visiblePatients(user: User) {
  return PATIENTS.filter((p) => canViewPatient(user, p.id));
}
export function listReports(user: User): Report[] {
  return load().reports.filter((r) => canViewReport(user, r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Report-level visibility (mirrors the database rule): physicians see only reports assigned to / acknowledged by them. */
export function canViewReport(user: User, r: Report): boolean {
  if (user.role === "physician") return r.assigneeId === user.id || r.physicianAckBy === user.id || r.activity.some((a) => a.byUserId === user.id);
  return canViewPatient(user, r.patientId);
}
export function getReport(user: User, id: string): Report | undefined {
  const r = load().reports.find((x) => x.id === id);
  return r && canViewReport(user, r) ? r : undefined;
}
/** Eligible physicians for a report, from the protected server lookup (same organization, active). */
export async function listAssignablePhysicians(reportId: string): Promise<{ id: string; nameAr: string; nameEn: string }[]> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("list_assignable_physicians", { p_report: reportId });
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.persona_id, nameAr: d.name_ar, nameEn: d.name_en }));
}

async function rpcAction(id: string, action: Action, target?: string, note?: string, plan?: string) {
  const supabase = await sb();
  const { error } = await supabase.rpc("report_action", { p_id: id, p_action: action, ...(target ? { p_target: target } : {}), ...(note ? { p_note: note } : {}), ...(plan ? { p_plan: plan } : {}) });
  if (error) throw new Error("forbidden");
  await refresh();
}

// Every write is re-checked by the database (role, assignment, status). UI checks are only hints.
export const AUDIO_MAX_S = 60;
export const AUDIO_MAX_BYTES = 2 * 1024 * 1024;
export async function submitReport(user: User, input: { pain: number; symptoms: Symptom[]; notes: string; audio?: { blob: Blob; durationS: number } | undefined }): Promise<Report> {
  const supabase = await sb();
  let audio: { p_audio_path: string; p_audio_duration: number; p_audio_mime: string } | {} = {};
  if (input.audio && user.patientId) {
    const mime = input.audio.blob.type.split(";")[0] || "audio/webm";
    const ext = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : mime === "audio/mpeg" ? "mp3" : "webm";
    const path = `${user.patientId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("report-audio").upload(path, input.audio.blob, { contentType: mime });
    if (upErr) throw new Error("upload");
    audio = { p_audio_path: path, p_audio_duration: Math.max(1, Math.min(AUDIO_MAX_S, Math.round(input.audio.durationS))), p_audio_mime: mime };
  }
  const { data, error } = await supabase.rpc("submit_report", { p_pain: input.pain, p_symptoms: input.symptoms, p_notes: input.notes, ...audio });
  if (error || !data) throw new Error("forbidden");
  await refresh();
  return cache.reports.find((r) => r.id === data)!;
}
export const returnAcknowledge = (_u: User, id: string) => rpcAction(id, "returnAck");
/** Eligible nurses for a return (assigned physician only): active, same org, on the care team. */
export async function listAssignableNurses(reportId: string): Promise<{ id: string; nameAr: string; nameEn: string }[]> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("list_assignable_nurses", { p_report: reportId });
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.persona_id, nameAr: d.name_ar, nameEn: d.name_en }));
}
/** Reports needing this nurse's action: new, returned to her, or her own nursing follow-ups. */
export const needsNurseAction = (user: User, r: Report) =>
  r.status === "submitted" || (r.assigneeId === user.id && (r.status === "returned_to_nursing" || r.status === "nursing_follow_up"));
export const nurseAcknowledge = (_u: User, id: string) => rpcAction(id, "nurseAck");
export const addNursingObservation = (_u: User, id: string, note: string) => rpcAction(id, "nursingObs", undefined, note);
export const escalateToPhysician = (_u: User, id: string, physicianId: string, note = "") => rpcAction(id, "escalate", physicianId, note);
export const physicianAcknowledge = (_u: User, id: string) => rpcAction(id, "physAck");
export const addAssessment = (_u: User, id: string, assessment: string, plan: string) => rpcAction(id, "assessment", undefined, assessment, plan);
export const returnToNursing = (_u: User, id: string, nurseId: string, note: string) => rpcAction(id, "returnToNursing", nurseId, note);
export const approveClosure = (_u: User, id: string) => rpcAction(id, "approveClosure");
export const adminAssign = (_u: User, id: string, assigneeId: string) => rpcAction(id, "adminAssign", assigneeId);

export const userById = (id?: string) => USERS.find((u) => u.id === id);
export const patientById = (id: string) => PATIENTS.find((p) => p.id === id);

/** Short-lived (5 min) signed URL; storage policy only allows users who can view the report. */
export async function reportAudioUrl(path: string): Promise<string> {
  const supabase = await sb();
  const { data, error } = await supabase.storage.from("report-audio").createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error("audio");
  return data.signedUrl;
}
