import { USERS, type Role } from "./store";

export const DEMO_ROLE_ORDER: Role[] = ["patient", "caregiver", "nurse", "physician", "admin"];
export const demoAccountGroups = () => DEMO_ROLE_ORDER.map((role) => ({
  role, users: USERS.filter((user) => user.role === role),
}));