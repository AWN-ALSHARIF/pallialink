import { expect, it } from "vitest";
import { PATIENTS, can, userById, type Report } from "@/lib/store";

const taleen = userById("u-xnurse")!;

it("Taleen is a nurse on all three demo patient care teams", () => {
  expect(taleen.role).toBe("nurse");
  for (const id of ["p1", "p2", "p3"]) expect(PATIENTS.find((p) => p.id === id)!.careTeam).toContain("u-xnurse");
});

it("Taleen never gets physician-only actions", () => {
  const r: Report = { id: "R", patientId: "p1", submittedBy: "u-pat", createdAt: "2026-01-01", pain: 5, symptoms: [], notes: "", status: "follow_up", assigneeId: "u-xnurse", activity: [] };
  expect(can(taleen, "approveClosure", r)).toBe(false);
  expect(can(taleen, "assessment", r)).toBe(false);
  expect(can(taleen, "nurseAck", { ...r, status: "submitted" })).toBe(true);
});
