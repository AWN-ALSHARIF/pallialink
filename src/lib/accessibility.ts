import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";

export const ACCESSIBILITY_NEEDS = ["speech_communication", "visual", "hearing", "motor", "cognitive", "digital_assistance", "other"] as const;
export const COMMUNICATION_METHODS = ["text", "pictures", "phrases", "voice", "tts", "screen_reader", "caregiver_assisted", "other"] as const;
export const INTERFACE_FLAGS = ["larger_controls", "reduced_motion", "simplified_navigation", "step_by_step", "visual_notifications", "screen_reader_friendly"] as const;
export const PATIENT_FLAGS = ["reduced_motion", "simplified_navigation"] as const;
const baseInterface = {
  text_size: z.enum(["standard", "large", "extra_large"]).optional(),
  contrast: z.enum(["standard", "high"]).optional(),
  reduced_motion: z.boolean().optional(),
  simplified_navigation: z.boolean().optional(),
};
export const personalInterfaceSchema = z.object(baseInterface).strict();
export const staffInterfaceSchema = z.object({ ...baseInterface, larger_controls: z.boolean().optional(), step_by_step: z.boolean().optional(), visual_notifications: z.boolean().optional(), screen_reader_friendly: z.boolean().optional() }).strict();
export type InterfacePreferences = z.infer<typeof staffInterfaceSchema>;
const methodFields = { communication_methods: z.array(z.enum(COMMUNICATION_METHODS)), primary_method: z.enum(COMMUNICATION_METHODS).nullable() };
export const personalPreferencesSchema = z.object({ ...methodFields, preferences: personalInterfaceSchema }).strict().refine((v) => v.primary_method === null || v.communication_methods.includes(v.primary_method), { path: ["primary_method"] });
export const accessibilityProfileSchema = z.object({
  needs: z.array(z.enum(ACCESSIBILITY_NEEDS)), other_need: z.string().max(500).nullable(),
  ...methodFields, interface_preferences: staffInterfaceSchema,
  support_notes: z.string().max(2000).nullable(), review_status: z.enum(["not_reviewed", "reviewed", "review_requested"]),
  next_review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict().refine((v) => v.primary_method === null || v.communication_methods.includes(v.primary_method), { path: ["primary_method"] })
  .refine((v) => !v.other_need || v.needs.includes("other"), { path: ["other_need"] });
export type AccessibilityDraft = z.infer<typeof accessibilityProfileSchema>;
export type PersonalDraft = z.infer<typeof personalPreferencesSchema>;
export type AccessibilityRow = Database["public"]["Tables"]["patient_accessibility_profiles"]["Row"];
export type PersonalRow = Database["public"]["Tables"]["patient_interface_preferences"]["Row"];
export type HistoryRow = Database["public"]["Tables"]["patient_accessibility_history"]["Row"];
export const emptyAccessibility = (): AccessibilityDraft => ({ needs: [], other_need: null, communication_methods: [], primary_method: null, interface_preferences: {}, support_notes: null, review_status: "not_reviewed", next_review_date: null });
export const emptyPersonal = (): PersonalDraft => ({ preferences: {}, communication_methods: [], primary_method: null });
export function profileDraft(row: AccessibilityRow | null): AccessibilityDraft {
  if (!row) return emptyAccessibility();
  return accessibilityProfileSchema.parse({ needs: row.needs, other_need: row.other_need, communication_methods: row.communication_methods, primary_method: row.primary_method, interface_preferences: row.staff_interface_preferences, support_notes: row.support_notes, review_status: row.review_status, next_review_date: row.next_review_date });
}
export function personalDraft(row: PersonalRow | null): PersonalDraft {
  if (!row) return emptyPersonal();
  return personalPreferencesSchema.parse({ preferences: row.preferences, communication_methods: row.communication_methods, primary_method: row.primary_method });
}
async function sb() { return (await import("@/integrations/supabase/client")).supabase; }
function fail(error: { message: string } | null) { if (error) throw new Error(error.message === "conflict" ? "conflict" : "unavailable"); }
// Fresh RLS/capability reads on every mount/focus. No offline storage or cross-identity cache.
export async function loadAccessibility(patientId: string) {
  const client = await sb();
  const { data: allowed, error: scopeError } = await client.rpc("accessibility_staff_scope", { p_patient: patientId });
  fail(scopeError); if (!allowed) throw new Error("forbidden");
  const [profile, personal, history, capability] = await Promise.all([
    client.from("patient_accessibility_profiles").select("*").eq("patient_id", patientId).maybeSingle(),
    client.from("patient_interface_preferences").select("*").eq("patient_id", patientId).maybeSingle(),
    client.from("patient_accessibility_history").select("*").eq("patient_id", patientId).order("id", { ascending: false }).limit(100),
    client.rpc("can_manage_patient_accessibility", { p_patient: patientId }),
  ]);
  [profile.error, personal.error, history.error, capability.error].forEach(fail);
  return { profile: profile.data, personal: personal.data, history: history.data ?? [], canEdit: capability.data === true };
}
export async function loadPersonal(patientId: string) {
  const client = await sb();
  const { data: allowed, error } = await client.rpc("accessibility_patient_scope", { p_patient: patientId });
  fail(error); if (!allowed) throw new Error("forbidden");
  const result = await client.from("patient_interface_preferences").select("*").eq("patient_id", patientId).maybeSingle();
  fail(result.error); return result.data;
}
export async function saveAccessibility(patientId: string, draft: AccessibilityDraft, revision: number) {
  const input = accessibilityProfileSchema.parse(draft);
  const { error } = await (await sb()).rpc("save_patient_accessibility", { p_patient: patientId, p_profile: input as Json, p_expected_revision: revision });
  fail(error);
}
export async function savePersonal(patientId: string, draft: PersonalDraft, revision: number) {
  const input = personalPreferencesSchema.parse(draft);
  const { error } = await (await sb()).rpc("save_patient_interface_preferences", { p_patient: patientId, p_preferences: input.preferences, p_methods: input.communication_methods, p_primary: input.primary_method ?? "", p_expected_revision: revision });
  fail(error);
}
export async function listAccessibilityStatus() {
  const { data, error } = await (await sb()).from("patient_accessibility_profiles").select("patient_id");
  fail(error); return (data ?? []).map((row) => row.patient_id);
}