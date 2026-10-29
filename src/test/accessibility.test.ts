import { describe, expect, it } from "vitest";
import { canHoldPermission } from "@/lib/admin";
import { accessibilityProfileSchema, emptyAccessibility, emptyPersonal, personalPreferencesSchema } from "@/lib/accessibility";

describe("Access+ structured boundaries", () => {
  it("allows nurses to hold the dedicated permission without physician closure", () => {
    expect(canHoldPermission("nurse", "manage_patient_accessibility")).toBe(true);
    expect(canHoldPermission("nurse", "approve_closure")).toBe(false);
  });
  it("allows physician grants but not patient or caregiver staff permissions", () => {
    expect(canHoldPermission("physician", "manage_patient_accessibility")).toBe(true);
    expect(canHoldPermission("patient", "manage_patient_accessibility")).toBe(false);
    expect(canHoldPermission("caregiver", "manage_patient_accessibility")).toBe(false);
  });
  it("supports multiple needs and communication alternatives", () => {
    expect(accessibilityProfileSchema.parse({ ...emptyAccessibility(), needs: ["visual", "motor"], communication_methods: ["text", "voice"], primary_method: "voice" }).needs).toEqual(["visual", "motor"]);
  });
  it("requires the primary method to remain among enabled alternatives", () => {
    expect(accessibilityProfileSchema.safeParse({ ...emptyAccessibility(), primary_method: "pictures", communication_methods: ["text"] }).success).toBe(false);
  });
  it("rejects staff notes in patient settings", () => {
    expect(personalPreferencesSchema.safeParse({ ...emptyPersonal(), support_notes: "not patient editable" }).success).toBe(false);
  });
  it("limits personal settings to the allowed nonclinical interface choices", () => {
    expect(personalPreferencesSchema.safeParse({ ...emptyPersonal(), preferences: { text_size: "large", contrast: "high", reduced_motion: true, simplified_navigation: true } }).success).toBe(true);
    expect(personalPreferencesSchema.safeParse({ ...emptyPersonal(), preferences: { step_by_step: true } }).success).toBe(false);
  });
  it("rejects diagnoses as accessibility categories", () => {
    expect(accessibilityProfileSchema.safeParse({ ...emptyAccessibility(), needs: ["stroke"] }).success).toBe(false);
  });
  it("requires an other need before an optional other description", () => {
    expect(accessibilityProfileSchema.safeParse({ ...emptyAccessibility(), other_need: "support" }).success).toBe(false);
  });
  it("does not preconfigure suggested scenarios", () => {
    expect(emptyAccessibility().needs).toEqual([]);
    expect(emptyAccessibility().communication_methods).toEqual([]);
    expect(emptyPersonal().preferences).toEqual({});
  });
});