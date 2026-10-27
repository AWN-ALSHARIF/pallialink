// Demo data layer. Persists to browser localStorage. Synthetic data only.
// Swap this module for a real backend later; UI depends only on these functions.

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
  type: "created" | "status" | "assigned" | "note";
  status?: Status;
  assigneeId?: string | undefined;
  note?: string | undefined;
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
  { id: "u-doc", role: "physician", nameAr: "د. فهد الزهراني", nameEn: "Dr. Fahad Al-Zahrani" },
  { id: "u-admin", role: "admin", nameAr: "ريم الدوسري", nameEn: "Reem Al-Dosari" },
];

export const PATIENTS: Patient[] = [
  { id: "p1", nameAr: "سارة العتيبي", nameEn: "Sarah Al-Otaibi", age: 64, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-nurse", "u-doc"] },
  { id: "p2", nameAr: "عبدالله الحربي", nameEn: "Abdullah Al-Harbi", age: 78, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-nurse", "u-doc"] },
  { id: "p3", nameAr: "منيرة الشهري", nameEn: "Munira Al-Shehri", age: 71, conditionAr: "رعاية تلطيفية منزلية", conditionEn: "Home palliative care", careTeam: ["u-doc"] },
];

export const CLINICIANS = USERS.filter((u) => u.role === "nurse" || u.role === "physician");
export const isClinical = (r: Role) => r === "nurse" || r === "physician" || r === "admin";

const KEY = "pallialink.db.v1";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function seed(): DB {
  const mk = (n: number, patientId: string, by: string, h: number, pain: number, symptoms: Symptom[], notes: string, status: Status, assigneeId?: string): Report => {
    const activity: Activity[] = [{ at: hoursAgo(h), byUserId: by, type: "created" }];
    const order = STATUSES.indexOf(status);
    if (assigneeId) activity.push({ at: hoursAgo(h - 0.3), byUserId: "u-admin", type: "assigned", assigneeId });
    STATUSES.slice(1, order + 1).forEach((s, i) =>
      activity.push({ at: hoursAgo(h - 0.5 - i), byUserId: assigneeId ?? "u-nurse", type: "status", status: s }),
    );
    return { id: `PL-${String(n).padStart(5, "0")}`, patientId, submittedBy: by, createdAt: hoursAgo(h), pain, symptoms, notes, status, assigneeId, activity };
  };
  return {
    seq: 1007,
    reports: [
      mk(1001, "p1", "u-pat", 72, 4, ["fatigue"], "تعب بعد الظهر", "closed", "u-nurse"),
      mk(1002, "p2", "u-cg", 50, 6, ["nausea", "sleep"], "صعوبة في النوم ليلة أمس", "follow_up", "u-doc"),
      mk(1003, "p3", "u-doc", 30, 3, ["breathlessness"], "", "under_review", "u-doc"),
      mk(1004, "p1", "u-pat", 20, 7, ["nausea", "fatigue"], "ألم متزايد في الظهر", "acknowledged", "u-nurse"),
      mk(1005, "p2", "u-cg", 6, 5, ["breathlessness"], "", "submitted"),
      mk(1006, "p3", "u-doc", 2, 2, ["sleep"], "", "submitted"),
    ],
  };
}

let cache: DB | null = null;
function load(): DB {
  if (cache) return cache;
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DB) : seed();
  } catch {
    cache = seed();
  }
  save(cache);
  return cache;
}
const listeners = new Set<() => void>();
function save(db: DB) {
  cache = db;
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
}
export const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
export const resetDemo = () => save(seed());

// ---- Access control ----
export function canViewPatient(user: User, patientId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "patient" || user.role === "caregiver") return user.patientId === patientId;
  return PATIENTS.find((p) => p.id === patientId)?.careTeam.includes(user.id) ?? false;
}
export const canUpdateStatus = (user: User) => user.role === "nurse" || user.role === "physician";
export const canAssign = (user: User) => user.role === "admin" || user.role === "physician" || user.role === "nurse";

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

export function submitReport(user: User, input: { pain: number; symptoms: Symptom[]; notes: string }): Report {
  if (!user.patientId || (user.role !== "patient" && user.role !== "caregiver")) throw new Error("forbidden");
  if (input.pain < 0 || input.pain > 10) throw new Error("invalid pain");
  const db = load();
  const seq = db.seq + 1;
  const now = new Date().toISOString();
  const report: Report = {
    id: `PL-${String(seq).padStart(5, "0")}`, patientId: user.patientId, submittedBy: user.id, createdAt: now,
    pain: input.pain, symptoms: input.symptoms, notes: input.notes.slice(0, 1000), status: "submitted",
    activity: [{ at: now, byUserId: user.id, type: "created" }],
  };
  save({ seq, reports: [report, ...db.reports] });
  return report;
}

function mutate(user: User, id: string, fn: (r: Report) => Report) {
  const db = load();
  const r = db.reports.find((x) => x.id === id);
  if (!r || !canViewPatient(user, r.patientId)) throw new Error("forbidden");
  save({ ...db, reports: db.reports.map((x) => (x.id === id ? fn(x) : x)) });
}

export function setStatus(user: User, id: string, status: Status, note?: string) {
  if (!canUpdateStatus(user)) throw new Error("forbidden");
  mutate(user, id, (r) => ({ ...r, status, activity: [...r.activity, { at: new Date().toISOString(), byUserId: user.id, type: "status", status, note: note || undefined }] }));
}
export function assign(user: User, id: string, assigneeId: string) {
  if (!canAssign(user) || !CLINICIANS.some((c) => c.id === assigneeId)) throw new Error("forbidden");
  mutate(user, id, (r) => ({ ...r, assigneeId, activity: [...r.activity, { at: new Date().toISOString(), byUserId: user.id, type: "assigned", assigneeId }] }));
}
export function addNote(user: User, id: string, note: string) {
  if (!isClinical(user.role) || !note.trim()) throw new Error("forbidden");
  mutate(user, id, (r) => ({ ...r, activity: [...r.activity, { at: new Date().toISOString(), byUserId: user.id, type: "note", note: note.slice(0, 1000) }] }));
}

export const userById = (id?: string) => USERS.find((u) => u.id === id);
export const patientById = (id: string) => PATIENTS.find((p) => p.id === id);
