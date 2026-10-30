import type { User } from "./store";

export function roleDashboard(role: User["role"]): "/patient" | "/clinic" | "/care" | "/admin" {
  if (role === "admin") return "/admin";
  if (role === "physician") return "/care";
  if (role === "nurse") return "/clinic";
  return "/patient";
}

/** Navigation eligibility only; resource access remains checked by the data layer. */
export function isRoleDestination(path: string, role: User["role"]): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  const pathname = path.split(/[?#]/)[0];
  const clinical = role === "nurse" || role === "physician" || role === "admin";
  if (pathname === "/") return true;
  if (pathname === "/patient" || pathname === "/report" || pathname === "/my-reports") return !clinical;
  if (pathname === "/admin") return role === "admin";
  if (pathname === "/care") return role === "physician";
  if (pathname === "/clinic" || pathname === "/records") return clinical;
  // Dynamic resource destinations require fresh scope checks and are not Back fallbacks.
  return false;
}

/** Keeps only visited route strings in memory; never stores patient content or credentials. */
export class NavigationVisits {
  private identity: string | null = null;
  private entries = new Map<number, string>();

  visit(identity: string, index: number, path: string) {
    if (identity !== this.identity) {
      this.entries.clear();
      this.identity = identity;
    }
    this.entries.set(index, path);
  }

  previous(identity: string, index: number, role: User["role"]): string | undefined {
    if (identity !== this.identity) return undefined;
    const path = this.entries.get(index - 1);
    return path && isRoleDestination(path, role) ? path : undefined;
  }
}