// Data layer backed by the Lovable Cloud database. Synthetic demo data only.
// UI depends only on these functions.

export type Role = "patient" | "caregiver" | "nurse" | "physician" | "admin";
export type Status = "submitted" | "acknowledged" | "under_review" | "follow_up" | "closed";
export const STATUSES: Status[] = ["submitted", "acknowledged", "under_review", "follow_up", "closed"];
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
  type: "created" | "status" | "assigned" | "note" | "nursing_obs" | "assessment" | "escalated" | "returned" | "closure_approved";
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
  activity: Activity[];
}
interface DB { reports: Report[]; seq: number }

export const USERS: User[] = [
  { id: "u-pat", role: "patient", nameAr: "سارة العتيبي", nameEn: "Sarah Al-Otaibi", patientId: "p1" },
  { id: "u-cg", role: "caregiver", nameAr: "خالد الحربي", nameEn: "Khalid Al-Harbi", patientId: "p2" },
  { id: "u-nurse", role: "nurse", nameAr: "الممرضة نورة القحطاني", nameEn: "Nurse Noura Al-Qahtani" },
  { id: "u-doc", role: "physician", nameAr: "د. فهد الزهراني", nameEn: "Dr. Fahad Al-Zahrani", canApproveClosure: true },
  { id: "u-doc2", role: "physician", nameAr: "د. لمى الغامدي", nameEn: "Dr. Lama Al-Ghamdi" },
  { id: "u-admin", role: "admin", nameAr: "ريم الدوسري", nameEn: "Reem Al-Dosari" },
];

export const PATIENTS: Patient[] = [
  { id: "p1", nameAr: "سارة العتيبي", nameEn: "Sarah Al-Otaibi", age: 64, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-nurse", "u-doc"] },
  { id: "p2", nameAr: "عبدالله الحربي", nameEn: "Abdullah Al-Harbi", age: 78, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-nurse", "u-doc"] },
  { id: "p3", nameAr: "منيرة الشهري", nameEn: "Munira Al-Shehri", age: 71, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-nurse", "u-doc2"] },
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

export async function refresh() {
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
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase.from("app_users").select("persona_id").eq("auth_id", data.user.id).maybeSingle();
  return row?.persona_id ?? null;
}

// ---- Access control (enforced inside every store function, not just in the UI) ----
export const NURSES = USERS.filter((u) => u.role === "nurse");
export const PHYSICIANS = USERS.filter((u) => u.role === "physician");

export function canViewPatient(user: User, patientId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "patient" || user.role === "caregiver") return user.patientId === patientId;
  if (user.role === "physician") {
    // Physicians only see patients with at least one report assigned to them.
    return load().reports.some((r) => r.patientId === patientId && r.assigneeId === user.id);
  }
  return PATIENTS.find((p) => p.id === patientId)?.careTeam.includes(user.id) ?? false;
}
export const isAssignedTo = (user: User, r: Report) => r.assigneeId === user.id;

export type Action = "nurseAck" | "nursingObs" | "escalate" | "physAck" | "assessment" | "returnToNursing" | "approveClosure" | "adminAssign";
/** Single source of truth for which role may do what on a report. */
export function can(user: User, action: Action, r: Report): boolean {
  if (!canViewPatient(user, r.patientId)) return false;
  const open = r.status !== "closed";
  switch (action) {
    case "nurseAck": return user.role === "nurse" && r.status === "submitted";
    case "nursingObs": return user.role === "nurse" && open;
    case "escalate": return user.role === "nurse" && open;
    case "physAck": return user.role === "physician" && isAssignedTo(user, r) && (r.status === "submitted" || r.status === "acknowledged");
    case "assessment": return user.role === "physician" && isAssignedTo(user, r) && open;
    case "returnToNursing": return user.role === "physician" && isAssignedTo(user, r) && open;
    case "approveClosure": return user.role === "physician" && !!user.canApproveClosure && isAssignedTo(user, r) && r.status === "follow_up";
    case "adminAssign": return user.role === "admin" && open;
  }
}

export function visiblePatients(user: User) {
  return PATIENTS.filter((p) => canViewPatient(user, p.id));
}
export function listReports(user: User): Report[] {
  return load().reports.filter((r) => canViewPatient(user, r.patientId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getReport(user: User, id: string): Report | undefined {
  const r = load().reports.find((x) => x.id === id);
  return r && canViewPatient(user, r.patientId) ? r : undefined;
}

async function rpcAction(id: string, action: Action, target?: string, note?: string, plan?: string) {
  const supabase = await sb();
  const { error } = await supabase.rpc("report_action", { p_id: id, p_action: action, ...(target ? { p_target: target } : {}), ...(note ? { p_note: note } : {}), ...(plan ? { p_plan: plan } : {}) });
  if (error) throw new Error("forbidden");
  await refresh();
}

// Every write is re-checked by the database (role, assignment, status). UI checks are only hints.
export async function submitReport(_user: User, input: { pain: number; symptoms: Symptom[]; notes: string }): Promise<Report> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("submit_report", { p_pain: input.pain, p_symptoms: input.symptoms, p_notes: input.notes });
  if (error || !data) throw new Error("forbidden");
  await refresh();
  return cache.reports.find((r) => r.id === data)!;
}
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
