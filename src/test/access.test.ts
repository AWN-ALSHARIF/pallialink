import { beforeEach, describe, expect, it } from "vitest";
import { getReport, listReports, resetDemo, setStatus, submitReport, USERS } from "@/lib/store";

const u = (id: string) => USERS.find((x) => x.id === id)!;

describe("demo access control", () => {
  beforeEach(() => resetDemo());

  it("patient only sees their own reports", () => {
    expect(listReports(u("u-pat")).every((r) => r.patientId === "p1")).toBe(true);
  });
  it("caregiver cannot open another patient's report", () => {
    expect(getReport(u("u-cg"), "PL-01001")).toBeUndefined();
  });
  it("nurse does not see patients outside their care team", () => {
    expect(listReports(u("u-nurse")).some((r) => r.patientId === "p3")).toBe(false);
  });
  it("admin cannot change report status", () => {
    expect(() => setStatus(u("u-admin"), "PL-01005", "closed")).toThrow();
  });
  it("submitted report gets a new unique ID and status Submitted", () => {
    const r = submitReport(u("u-pat"), { pain: 5, symptoms: [], notes: "" });
    expect(r.id).toBe("PL-01008");
    expect(r.status).toBe("submitted");
  });
});
