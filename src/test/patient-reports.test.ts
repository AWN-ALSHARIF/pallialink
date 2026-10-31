import { describe, expect, it, afterEach } from "vitest";
import { __setReportsForTest, type Report, type User, STATUSES } from "../lib/store";
import { patientReportProjection, patientReports } from "../lib/patient-reports";
import { navigationAr } from "../lib/navigation-i18n";

const report: Report = {
  id: "TEST-1", patientId: "p1", submittedBy: "u-pat", createdAt: "2026-10-30T10:00:00Z",
  pain: 4, symptoms: ["fatigue"], notes: "patient original", status: "closed", returnReason: "private reason",
  activity: [
    { at: "2026-10-30T10:01:00Z", byUserId: "u-nurse", type: "status", status: "acknowledged" },
    { at: "2026-10-30T10:02:00Z", byUserId: "u-doc", type: "note", note: "private clinical note", plan: "private plan" },
    { at: "2026-10-30T10:03:00Z", byUserId: "u-admin", type: "assigned", status: "awaiting_physician" },
    { at: "2026-10-30T10:04:00Z", byUserId: "u-doc", type: "closure_approved", status: "closed" },
  ],
};
afterEach(() => __setReportsForTest([]));
describe("patient report presentation", () => {
  it("includes only recorded milestones, never invents missing progress", () => {
    expect(patientReportProjection(report).milestones.map((m) => m.status)).toEqual(["submitted", "acknowledged", "closed"]);
    expect(patientReportProjection(report).lastUpdate).toBe("2026-10-30T10:04:00Z");
  });
  it("excludes clinical notes, actor metadata, assignments and return reasons", () => {
    const projected = patientReportProjection(report);
    expect(projected.notes).toBe("patient original");
    expect(projected).not.toHaveProperty("activity");
    expect(projected).not.toHaveProperty("returnReason");
    expect(projected.milestones[1]).not.toHaveProperty("byUserId");
    expect(JSON.stringify(projected)).not.toContain("private");
  });
  it("patient and explicitly linked caregiver see only their patient", () => {
    __setReportsForTest([report, { ...report, id: "TEST-2", patientId: "p2" }]);
    const patient: User = { id: "u-pat", role: "patient", patientId: "p1", nameAr: "", nameEn: "" };
    expect(patientReports(patient).map((r) => r.id)).toEqual(["TEST-1"]);
    expect(patientReports({ ...patient, role: "caregiver", id: "u-cg" }).map((r) => r.id)).toEqual(["TEST-1"]);
    expect(patientReports({ ...patient, patientId: undefined })).toEqual([]);
    expect(patientReports({ ...patient, role: "nurse" })).toEqual([]);
  });
  it("supports every actual report state", () => {
    for (const status of STATUSES) expect(patientReportProjection({ ...report, status }).status).toBe(status);
    expect(Object.keys(navigationAr.status).sort()).toEqual([...STATUSES].sort());
  });
});