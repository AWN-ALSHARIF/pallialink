// Organization administration. Every call is re-checked in the database (active admin, same org).
async function sb() { return (await import("@/integrations/supabase/client")).supabase; }

export type OptionalPermission = "approve_closure" | "reassign_reports" | "manage_patient_accessibility";
/** Optional delegated permissions per role. Nurses can never receive physician-only privileges. */
export const OPTIONAL_PERMISSIONS: Record<"nurse" | "physician", OptionalPermission[]> = {
  physician: ["approve_closure", "reassign_reports", "manage_patient_accessibility"],
  nurse: ["reassign_reports", "manage_patient_accessibility"],
};
export const MANDATORY_PERMISSIONS = {
  physician: ["phys_ack", "phys_assessment", "phys_return", "phys_tasks", "phys_review", "phys_followups"],
  nurse: ["nurse_ack", "nurse_obs", "nurse_escalate", "nurse_tasks", "nurse_assess"],
} as const;
export const canHoldPermission = (role: string, p: OptionalPermission) =>
  (role === "nurse" || role === "physician") && OPTIONAL_PERMISSIONS[role].includes(p);

export interface Staff { id: string; role: "nurse" | "physician"; nameAr: string; nameEn: string; active: boolean; canApproveClosure: boolean; permissions: string[]; patientCount: number; openReports: number; openTasks: number }
export interface PatientRow { id: string; nameAr: string; nameEn: string; mrn: string | null; careTeam: string[]; openReports: number; openTasks: number; lastUpdate: string | null; nextFollowup: string | null }
export interface AuditRow { id: number; actorId: string; action: string; targetUserId: string | null; resourceType: string | null; resourceId: string | null; oldValue: unknown; newValue: unknown; at: string }
export interface OpenTask { id: string; patientId: string; nurseId: string; category: string; status: string; dueAt: string | null }
export interface Metrics {
  patients: number; active_physicians: number; active_nurses: number; open_reports: number; awaiting_physician: number;
  active_tasks: number; overdue_tasks: number; pending_reviews: number; closed_reports: number;
  avg_ack_minutes: number | null; avg_task_minutes: number | null;
  report_trend: { bucket: string; count: number; avg_ack_minutes: number | null }[];
  task_trend: { bucket: string; created: number; completed: number }[];
  overdue_followups: number; followups_done: number;
}

const fail = (e: unknown) => { if (e) throw new Error("forbidden"); };

export async function listStaff(): Promise<Staff[]> {
  const { data, error } = await (await sb()).rpc("admin_list_staff"); fail(error);
  return (data ?? []).map((s) => ({ id: s.persona_id, role: s.role as Staff["role"], nameAr: s.name_ar, nameEn: s.name_en, active: s.active, canApproveClosure: s.can_approve_closure, permissions: s.permissions ?? [], patientCount: s.patient_count, openReports: s.open_reports, openTasks: s.open_tasks }));
}
export async function listPatients(): Promise<PatientRow[]> {
  const { data, error } = await (await sb()).rpc("admin_patient_overview"); fail(error);
  return (data ?? []).map((p) => ({ id: p.patient_id, nameAr: p.name_ar, nameEn: p.name_en, mrn: p.mrn, careTeam: p.care_team ?? [], openReports: p.open_reports, openTasks: p.open_tasks, lastUpdate: p.last_update, nextFollowup: p.next_followup }));
}
export async function listOpenTasks(): Promise<OpenTask[]> {
  const { data, error } = await (await sb()).rpc("admin_list_open_tasks"); fail(error);
  return (data ?? []).map((t) => ({ id: t.id, patientId: t.patient_id, nurseId: t.nurse_id, category: t.category, status: t.status, dueAt: t.due_at }));
}
export async function getMetrics(from: Date, to: Date, bucket: "week" | "month"): Promise<Metrics> {
  const { data, error } = await (await sb()).rpc("admin_metrics", { p_from: from.toISOString(), p_to: to.toISOString(), p_bucket: bucket }); fail(error);
  return data as unknown as Metrics;
}
export async function listAudit(): Promise<AuditRow[]> {
  const { data, error } = await (await sb()).from("admin_audit_log").select("*").order("id", { ascending: false }).limit(200); fail(error);
  return (data ?? []).map((a) => ({ id: a.id, actorId: a.actor_id, action: a.action, targetUserId: a.target_user_id, resourceType: a.resource_type, resourceId: a.resource_id, oldValue: a.old_value, newValue: a.new_value, at: a.at }));
}
export async function setPermission(personaId: string, permission: OptionalPermission, enabled: boolean) {
  const { error } = await (await sb()).rpc("admin_set_permission", { p_persona: personaId, p_permission: permission, p_enabled: enabled }); fail(error);
}
export async function setStaffActive(personaId: string, active: boolean) {
  const { error } = await (await sb()).rpc("admin_set_staff_active", { p_persona: personaId, p_active: active }); fail(error);
}
export async function setCareTeam(patientId: string, team: string[]) {
  const { error } = await (await sb()).rpc("admin_set_care_team", { p_patient: patientId, p_team: team }); fail(error);
}
export async function reassignTask(taskId: string, nurseId: string) {
  const { error } = await (await sb()).rpc("admin_reassign_task", { p_task: taskId, p_nurse: nurseId }); fail(error);
}
