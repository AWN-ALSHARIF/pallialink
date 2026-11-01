import { describe, expect, it } from "vitest";
import { isRoleDestination, NavigationVisits, roleDashboard } from "../lib/navigation";

describe("role-safe navigation", () => {
  it("returns the role's dashboard after a direct entry", () => {
    expect(roleDashboard("patient")).toBe("/patient");
    expect(roleDashboard("caregiver")).toBe("/patient");
    expect(roleDashboard("nurse")).toBe("/clinic");
    expect(roleDashboard("physician")).toBe("/clinic");
    expect(roleDashboard("admin")).toBe("/admin");
  });
  it("preserves prior list filters while excluding inaccessible routes", () => {
    const visits = new NavigationVisits();
    visits.visit("staff", 3, "/admin?tab=operations");
    visits.visit("staff", 4, "/records/p1");
    expect(visits.previous("staff", 4, "admin")).toBe("/admin?tab=operations");
    expect(visits.previous("staff", 4, "nurse")).toBeUndefined();
    expect(isRoleDestination("https://external.example", "admin")).toBe(false);
    expect(isRoleDestination("//external.example", "admin")).toBe(false);
    expect(isRoleDestination("/login", "patient")).toBe(false);
    expect(isRoleDestination("/reports/PL-1", "physician")).toBe(false);
  });
  it("never returns account A's history to account B", () => {
    const visits = new NavigationVisits();
    visits.visit("A", 0, "/clinic");
    visits.visit("A", 1, "/records");
    expect(visits.previous("A", 1, "nurse")).toBe("/clinic");
    expect(visits.previous("B", 1, "nurse")).toBeUndefined();
    visits.visit("B", 2, "/patient");
    expect(visits.previous("A", 1, "nurse")).toBeUndefined();
    expect(visits.previous("B", 2, "patient")).toBeUndefined();
  });
});