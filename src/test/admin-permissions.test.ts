import { describe, expect, it } from "vitest";
import { canHoldPermission } from "@/lib/admin";

describe("delegated permissions", () => {
  it("nurses can never hold closure approval", () => {
    expect(canHoldPermission("nurse", "approve_closure")).toBe(false);
  });
  it("physicians can hold closure approval", () => {
    expect(canHoldPermission("physician", "approve_closure")).toBe(true);
  });
  it("admins cannot hold clinical permissions", () => {
    expect(canHoldPermission("admin", "approve_closure")).toBe(false);
    expect(canHoldPermission("admin", "reassign_reports")).toBe(false);
  });
});
