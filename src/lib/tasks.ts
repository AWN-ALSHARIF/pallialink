// Nursing tasks, follow-up plans and in-app notifications.
// Reads go through database row-level rules; writes only through checked database functions
// that re-verify role, active status, organization and care-team membership.
import { patientById, type User } from "./store";

export type TaskCategory =
  | "pain_assessment" | "vital_signs" | "symptom_assessment" | "med_adherence"
  | "home_visit" | "general_followup" | "custom";
export const TASK_CATEGORIES: TaskCategory[] = [
  "pain_assessment", "vital_signs", "symptom_assessment", "med_adherence", "home_visit", "general_followup", "custom",
];
export type TaskStatus = "new" | "acknowledged" | "in_progress" | "completed_pending_review" | "reviewed" | "unable";
export const TASK_STATUSES: TaskStatus[] = ["new", "acknowledged", "in_progress", "completed_pending_review", "reviewed", "unable"];
export type TaskAction = "ack" | "start" | "complete" | "unable" | "review" | "clarify";
export type TaskPriority = "routine" | "urgent";

export interface NursingTask {
  id: string; patientId: string; physicianId: string; nurseId: string;
  category: TaskCategory; instructions: string; priority: TaskPriority;
  dueAt: string | null; status: TaskStatus;
  findings: string | null; unableReason: string | null; reviewNote: string | null;
  createdAt: string; ackAt: string | null; completedAt: string | null; reviewedAt: string | null;
}
export interface FollowUp {
  id: number; patientId: string; purpose: string; responsibleId: string;
  targetDate: string; status: "planned" | "done" | "cancelled";
  completionNotes: string | null; createdBy: string; createdAt: string; completedAt: string | null;
}
export type NotifKind = "task_assigned" | "task_completed" | "review_requested" | "patient_update" | "task_overdue";
export interface AppNotification {
  id: number; userId: string; patientId: string | null; kind: NotifKind; refId: string | null;
  createdAt: string; readAt: string | null;
}

async function sb() { return (await import("@/integrations/supabase/client")).supabase; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapTask = (r: any): NursingTask => ({
  id: r.id, patientId: r.patient_id, physicianId: r.physician_id, nurseId: r.nurse_id,
  category: r.category, instructions: r.instructions, priority: r.priority, dueAt: r.due_at,
  status: r.status, findings: r.findings, unableReason: r.unable_reason, reviewNote: r.review_note,
  createdAt: r.created_at, ackAt: r.ack_at, completedAt: r.completed_at, reviewedAt: r.reviewed_at,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapFollowUp = (r: any): FollowUp => ({
  id: r.id, patientId: r.patient_id, purpose: r.purpose, responsibleId: r.responsible_id,
  targetDate: r.target_date, status: r.status, completionNotes: r.completion_notes,
  createdBy: r.created_by, createdAt: r.created_at, completedAt: r.completed_at,
});

/** All tasks the caller may see (database rules scope to the caller's care teams). */
export async function listTasks(): Promise<NursingTask[]> {
  const supabase = await sb();
  const { data, error } = await supabase.from("nursing_tasks").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}
export async function listFollowUps(): Promise<FollowUp[]> {
  const supabase = await sb();
  const { data, error } = await supabase.from("follow_ups").select("*").order("target_date");
  if (error) throw error;
  return (data ?? []).map(mapFollowUp);
}

export async function createTask(
  patientId: string, nurseId: string, category: TaskCategory,
  instructions: string, priority: TaskPriority, dueAt: string | null,
): Promise<string> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("create_nursing_task", {
    p_patient: patientId, p_nurse: nurseId, p_category: category,
    p_instructions: instructions, p_priority: priority,
    ...(dueAt ? { p_due_at: dueAt } : {}),
  });
  if (error || !data) throw new Error("forbidden");
  return data;
}
export async function taskAction(id: string, action: TaskAction, note?: string) {
  const supabase = await sb();
  const { error } = await supabase.rpc("nursing_task_action", {
    p_id: id, p_action: action, ...(note?.trim() ? { p_note: note.trim() } : {}),
  });
  if (error) throw new Error("forbidden");
}
export async function createFollowup(patientId: string, purpose: string, responsibleId: string, targetDate: string) {
  const supabase = await sb();
  const { error } = await supabase.rpc("create_followup", {
    p_patient: patientId, p_purpose: purpose, p_responsible: responsibleId, p_target_date: targetDate,
  });
  if (error) throw new Error("forbidden");
}
export async function updateFollowup(id: number, status: "done" | "cancelled", notes?: string) {
  const supabase = await sb();
  const { error } = await supabase.rpc("update_followup", {
    p_id: id, p_status: status, ...(notes?.trim() ? { p_notes: notes.trim() } : {}),
  });
  if (error) throw new Error("forbidden");
}
/** Eligible nurses for a new task: active, same org, on the patient's care team (server-checked). */
export async function listCareTeamNurses(patientId: string): Promise<{ id: string; nameAr: string; nameEn: string }[]> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("list_care_team_nurses", { p_patient: patientId });
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.persona_id, nameAr: d.name_ar, nameEn: d.name_en }));
}
export async function listNotifications(): Promise<AppNotification[]> {
  const supabase = await sb();
  const { data, error } = await supabase.rpc("list_notifications");
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, userId: r.user_id, patientId: r.patient_id, kind: r.kind, refId: r.ref_id,
    createdAt: r.created_at, readAt: r.read_at,
  }));
}
export async function markNotificationsRead(ids: number[]) {
  if (!ids.length) return;
  const supabase = await sb();
  await supabase.rpc("mark_notifications_read", { p_ids: ids });
}

// ---- Permission mirrors (the database re-checks every write) ----
export const canCreateTask = (user: User, patientId: string) =>
  user.role === "physician" && (patientById(patientId)?.careTeam.includes(user.id) ?? false);
export function nurseTaskActions(user: User, t: NursingTask): TaskAction[] {
  if (user.role !== "nurse" || t.nurseId !== user.id) return [];
  switch (t.status) {
    case "new": return ["ack", "start", "unable"];
    case "acknowledged": return ["start", "complete", "unable"];
    case "in_progress": return ["complete", "unable"];
    default: return [];
  }
}
export function physicianTaskActions(user: User, t: NursingTask): TaskAction[] {
  if (user.role !== "physician" || t.physicianId !== user.id) return [];
  if (t.status === "completed_pending_review") return ["review", "clarify"];
  if (t.status === "unable") return ["clarify"];
  return [];
}
export const isTaskOpen = (t: NursingTask) => ["new", "acknowledged", "in_progress"].includes(t.status);
export const isTaskOverdue = (t: NursingTask) => !!t.dueAt && new Date(t.dueAt) < new Date() && isTaskOpen(t);
export const isFollowUpOverdue = (f: FollowUp) => f.status === "planned" && f.targetDate < new Date().toISOString().slice(0, 10);
