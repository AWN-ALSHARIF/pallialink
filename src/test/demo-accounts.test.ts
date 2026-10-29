import { expect, it } from "vitest";
import { demoAccountGroups } from "@/lib/demo-accounts";

it("orders all nine existing demo accounts without changing their identities", () => {
  const groups = demoAccountGroups();
  expect(groups.map((group) => group.role)).toEqual(["patient", "caregiver", "nurse", "physician", "admin"]);
  expect(groups.flatMap((group) => group.users.map((user) => user.id))).toEqual([
    "u-pat", "u-pat2", "u-pat3", "u-cg", "u-nurse", "u-xnurse", "u-doc", "u-doc2", "u-admin",
  ]);
});