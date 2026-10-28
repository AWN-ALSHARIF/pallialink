import { beforeEach, describe, expect, it } from "vitest";
import { __setReportsForTest, can, getReport, listReports, USERS, type Report } from "@/lib/store";

// UI-side permission hints. The same rules are enforced again by the database functions.
const u = (id: string) => USERS.find((x) => x.id === id)!;
const rep = (id: string, patientId: string, status: Report["status"], assigneeId?: string): Report => ({
  id, patientId, submittedBy: "u-pat", createdAt: new Date().toISOString(), pain: 5, symptoms: [], notes: "", status, assigneeId, activity: [],
});

describe("role hints", () => {
  beforeEach(() => __setReportsForTest([
    rep("PL-1", "p1", "follow_up", "u-doc"),
    rep("PL-2", "p3", "under_review", "u-doc2"),
    rep("PL-3", "p2", "submitted"),
  ]));
  it("patient only sees their own reports", () => {
    expect(listReports(u("u-pat")).map((r) => r.id)).toEqual(["PL-1"]);
  });
  it("physician cannot see patients with no report assigned to them", () => {
    expect(getReport(u("u-doc"), "PL-2")).toBeUndefined();
  });
  it("nurse cannot approve closure; authorised assigned physician can", () => {
    const r = getReport(u("u-doc"), "PL-1")!;
    expect(can(u("u-nurse"), "approveClosure", r)).toBe(false);
    expect(can(u("u-doc"), "approveClosure", r)).toBe(true);
  });
  it("only nurse can acknowledge a submitted report", () => {
    const r = getReport(u("u-admin"), "PL-3")!;
    expect(can(u("u-nurse"), "nurseAck", r)).toBe(true);
    expect(can(u("u-admin"), "nurseAck", r)).toBe(false);
  });
  it("physician cannot see another physician's report for a patient they also treat", () => {
    __setReportsForTest([rep("A", "p1", "under_review", "u-doc"), rep("B", "p1", "under_review", "u-doc2")]);
    expect(listReports(u("u-doc")).map((r) => r.id)).toEqual(["A"]);
  });
  it("nurse can escalate only after nursing acknowledgment", () => {
    expect(can(u("u-nurse"), "escalate", rep("X", "p1", "submitted"))).toBe(false);
    expect(can(u("u-nurse"), "escalate", rep("X", "p1", "acknowledged"))).toBe(true);
  });
  it("only the assigned physician acknowledges, and only while awaiting them", () => {
    const r = rep("Y", "p3", "awaiting_physician", "u-doc2");
    __setReportsForTest([r]);
    expect(can(u("u-doc2"), "physAck", r)).toBe(true);
    expect(can(u("u-doc"), "physAck", r)).toBe(false);
    expect(can(u("u-doc2"), "physAck", { ...r, status: "acknowledged" })).toBe(false);
  });
  it("assessment requires physician acknowledgment first", () => {
    const r = rep("Z", "p1", "awaiting_physician", "u-doc");
    __setReportsForTest([r]);
    expect(can(u("u-doc"), "assessment", r)).toBe(false);
    expect(can(u("u-doc"), "assessment", { ...r, status: "under_review" })).toBe(true);
  });
});
