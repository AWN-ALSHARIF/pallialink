import { describe, expect, it } from "vitest";
import { USERS } from "@/lib/store";
import {
  canCreateTask, isTaskOpen, isTaskOverdue, nurseTaskActions, physicianTaskActions,
  type NursingTask,
} from "@/lib/tasks";

// UI-side permission hints for nursing tasks. The database functions re-check every rule.
const u = (id: string) => USERS.find((x) => x.id === id)!;
const task = (over: Partial<NursingTask> = {}): NursingTask => ({
  id: "NT-1", patientId: "p1", physicianId: "u-doc", nurseId: "u-nurse",
  category: "general_followup", instructions: "x", priority: "routine", dueAt: null,
  status: "new", findings: null, unableReason: null, reviewNote: null,
  createdAt: new Date().toISOString(), ackAt: null, completedAt: null, reviewedAt: null,
  ...over,
});

describe("nursing task permissions", () => {
  it("only a physician on the patient's care team can create a task", () => {
    expect(canCreateTask(u("u-doc"), "p1")).toBe(true);
    expect(canCreateTask(u("u-nurse"), "p1")).toBe(false);
    expect(canCreateTask(u("u-admin"), "p1")).toBe(false);
    expect(canCreateTask(u("u-doc2"), "p1")).toBe(false); // not on p1's care team
  });
  it("only the assigned nurse can act on a task", () => {
    const t = task();
    expect(nurseTaskActions(u("u-nurse"), t)).toEqual(["ack", "start", "unable"]);
    expect(nurseTaskActions(u("u-xnurse"), t)).toEqual([]);
    expect(nurseTaskActions(u("u-doc"), t)).toEqual([]);
  });
  it("nurse actions follow the status lifecycle", () => {
    expect(nurseTaskActions(u("u-nurse"), task({ status: "acknowledged" }))).toEqual(["start", "complete", "unable"]);
    expect(nurseTaskActions(u("u-nurse"), task({ status: "in_progress" }))).toEqual(["complete", "unable"]);
    expect(nurseTaskActions(u("u-nurse"), task({ status: "completed_pending_review" }))).toEqual([]);
    expect(nurseTaskActions(u("u-nurse"), task({ status: "reviewed" }))).toEqual([]);
  });
  it("only the requesting physician reviews or requests clarification", () => {
    const t = task({ status: "completed_pending_review" });
    expect(physicianTaskActions(u("u-doc"), t)).toEqual(["review", "clarify"]);
    expect(physicianTaskActions(u("u-doc2"), t)).toEqual([]);
    expect(physicianTaskActions(u("u-doc"), task({ status: "unable" }))).toEqual(["clarify"]);
    expect(physicianTaskActions(u("u-doc"), task({ status: "new" }))).toEqual([]);
  });
  it("overdue means past due and still open", () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(isTaskOverdue(task({ dueAt: past }))).toBe(true);
    expect(isTaskOverdue(task({ dueAt: past, status: "reviewed" }))).toBe(false);
    expect(isTaskOverdue(task({ dueAt: null }))).toBe(false);
    expect(isTaskOpen(task({ status: "unable" }))).toBe(false);
  });
});
