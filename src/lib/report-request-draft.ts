// Identity-scoped ephemeral, nonclinical request keys only. Never persisted offline.
let pending: { identity: string; keys: string[] } | null = null;
export function queueReportRequest(identity: string, key: string) { pending = { identity, keys: pending?.identity === identity ? [...new Set([...pending.keys, key])] : [key] }; }
export function takeReportRequests(identity: string): string[] { const keys = pending?.identity === identity ? pending.keys : []; pending = null; return keys; }