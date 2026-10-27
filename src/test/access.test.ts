import { beforeEach, describe, expect, it } from "vitest";
import {
  addAssessment, addNursingObservation, approveClosure, escalateToPhysician, getReport, listReports,
  nurseAcknowledge, physicianAcknowledge, resetDemo, returnToNursing, submitReport, USERS,
} from "@/lib/store";

const u = (id: string) => USERS.find((x) => x.id === id)!;

describe("demo access control", () => {
  beforeEach(() => resetDemo());

  it("patient only sees their own reports", () => {
    expect(listReports(u("u-pat")).every((r) => r.patientId === "p1")).toBe(true);
  });
  it("caregiver cannot open another patient's report", () => {
    expect(getReport(u("u-cg"), "PL-01001")).toBeUndefined();
  });
  it("submitted report gets a new unique ID and status Submitted", () => {
    const r = submitReport(u("u-pat"), { pain: 5, symptoms: [], notes: "" });
    expect(r.id).toBe("PL-01008");
    expect(r.status).toBe("submitted");
  });
});

describe("nurse vs physician workflows", () => {
  beforeEach(() => resetDemo());

  it("nurse cannot document an assessment or approve closure", () => {
    expect(() => addAssessment(u("u-nurse"), "PL-01004", "x", "y")).toThrow();
    expect(() => approveClosure(u("u-nurse"), "PL-01002")).toThrow();
  });
  it("physician cannot see patients with no report assigned to them", () => {
    expect(listReports(u("u-doc")).some((r) => r.patientId === "p3")).toBe(false);
    expect(getReport(u("u-doc"), "PL-01003")).toBeUndefined();
  });
  it("nurse escalation makes the report visible to that physician", () => {
    const r = submitReport(u("u-pat"), { pain: 6, symptoms: [], notes: "" });
    expect(getReport(u("u-doc2"), r.id)).toBeUndefined();
    nurseAcknowledge(u("u-nurse"), r.id);
    // p1's care team has u-doc; escalate there
    escalateToPhysician(u("u-nurse"), r.id, "u-doc");
    expect(getReport(u("u-doc"), r.id)?.assigneeId).toBe("u-doc");
  });
  it("full flow ends closed with a timestamped audit entry per step", () => {
    const r = submitReport(u("u-cg"), { pain: 4, symptoms: [], notes: "" });
    nurseAcknowledge(u("u-nurse"), r.id);
    addNursingObservation(u("u-nurse"), r.id, "obs");
    escalateToPhysician(u("u-nurse"), r.id, "u-doc");
    physicianAcknowledge(u("u-doc"), r.id);
    addAssessment(u("u-doc"), r.id, "a", "p");
    approveClosure(u("u-doc"), r.id);
    const final = getReport(u("u-doc"), r.id)!;
    expect(final.status).toBe("closed");
    expect(final.activity.map((a) => a.type)).toEqual(["created", "status", "nursing_obs", "escalated", "status", "assessment", "closure_approved"]);
    expect(final.activity.every((a) => !Number.isNaN(Date.parse(a.at)))).toBe(true);
  });
  it("physician without closure authorization cannot close", () => {
    // PL-01003 is assigned to u-doc2 (not authorized)
    addAssessment(u("u-doc2"), "PL-01003", "a", "p");
    expect(() => approveClosure(u("u-doc2"), "PL-01003")).toThrow();
  });
  it("physician cannot act on a report assigned to someone else", () => {
    expect(() => addAssessment(u("u-doc"), "PL-01004", "a", "p")).toThrow();
  });
  it("returning to nursing reassigns to the nurse", () => {
    returnToNursing(u("u-doc"), "PL-01002", "u-nurse", "please visit");
    expect(getReport(u("u-nurse"), "PL-01002")?.assigneeId).toBe("u-nurse");
  });
});
