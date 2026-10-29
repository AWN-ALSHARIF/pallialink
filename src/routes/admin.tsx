import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { listAccessibilityStatus } from "@/lib/accessibility";
import { Activity, BarChart3, Building2, KeyRound, Lock, ScrollText, Search, Users, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/shell";
import { useApp, useFmtDate, useName } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import {
  canHoldPermission, getMetrics, listAudit, listOpenTasks, listPatients, listStaff, MANDATORY_PERMISSIONS, OPTIONAL_PERMISSIONS,
  reassignTask, setCareTeam, setPermission, setStaffActive,
  type AuditRow, type Metrics, type OpenTask, type OptionalPermission, type PatientRow, type Staff,
} from "@/lib/admin";
import { userById } from "@/lib/store";

type Tab = "overview" | "staff" | "patients" | "perms" | "analytics" | "audit";
const TABS: Tab[] = ["overview", "staff", "patients", "perms", "analytics", "audit"];

export const Route = createFileRoute("/admin")({
  validateSearch: (s: Record<string, unknown>): { tab: Tab } => ({ tab: TABS.includes(s['tab'] as Tab) ? (s['tab'] as Tab) : "overview" }),
  head: () => ({
    meta: [
      { title: "Organization Command Center | PalliaLink" },
      { name: "description", content: "Operational indicators, staff, care teams, permissions and audit for palliative care organizations." },
      { property: "og:title", content: "Organization Command Center | PalliaLink" },
      { property: "og:description", content: "Manage care operations, staff permissions and audit history securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const ICONS: Record<Tab, typeof Activity> = { overview: Building2, staff: Users, patients: UserRound, perms: KeyRound, analytics: BarChart3, audit: ScrollText };

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => { fn().then((d) => { setData(d); setErr(false); }, () => setErr(true)); }, deps);
  useEffect(reload, [reload]);
  return { data, err, reload };
}

function AdminPage() {
  const user = useGuard("clinic");
  const { t } = useApp();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><p className="card p-6">{t.adm.error}</p></AppShell>;
  return (
    <AppShell>
      <div className="rounded-2xl bg-navy p-5 text-navy-foreground shadow-soft">
        <div className="flex items-center gap-3"><Building2 className="size-6" /><h1 className="text-2xl font-bold sm:text-3xl">{t.adm.title}</h1></div>
      </div>
      <nav className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-1 lg:flex-wrap" role="tablist">
        {TABS.map((k) => { const I = ICONS[k]; return (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => navigate({ search: { tab: k } })} className={`btn min-h-11 shrink-0 ${tab === k ? "btn-primary" : "btn-outline"}`}>
            <I className="size-4" /> {t.adm.tabs[k]}
          </button>); })}
      </nav>
      <div className="mt-6">
        {tab === "overview" && <Overview />}
        {tab === "staff" && <StaffTab />}
        {tab === "patients" && <PatientsTab />}
        {tab === "perms" && <PermsTab />}
        {tab === "analytics" && <Analytics />}
        {tab === "audit" && <AuditTab />}
      </div>
    </AppShell>
  );
}

function Err() { const { t } = useApp(); return <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{t.adm.error}</p>; }
function Loading() { return <div className="card h-32 animate-pulse" />; }

function Confirm({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  const { t } = useApp();
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4">
      <div className="card w-full max-w-sm p-5">
        <p className="font-semibold">{text}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn btn-outline min-h-10" onClick={onNo}>{t.adm.cancel}</button>
          <button className="btn btn-primary min-h-10" onClick={onYes} autoFocus>{t.adm.confirm}</button>
        </div>
      </div>
    </div>
  );
}

function useAction() {
  const { t } = useApp();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<void>, after?: () => void) => {
    try { await fn(); setMsg({ ok: true, text: t.adm.saved }); after?.(); } catch { setMsg({ ok: false, text: t.adm.error }); }
  };
  const node = msg && <p role="status" className={`mb-3 rounded-xl p-3 text-sm ${msg.ok ? "bg-success/15" : "bg-destructive/10 text-destructive"}`}>{msg.text}</p>;
  return { run, node };
}

function useRange() {
  const [bucket, setBucket] = useState<"week" | "month">("week");
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  return { bucket, setBucket, from, setFrom, to, setTo };
}
function RangeBar({ r }: { r: ReturnType<typeof useRange> }) {
  const { t } = useApp();
  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <label className="text-sm">{t.adm.from}<input type="date" className="field mt-1" value={r.from} onChange={(e) => r.setFrom(e.target.value)} /></label>
      <label className="text-sm">{t.adm.to}<input type="date" className="field mt-1" value={r.to} onChange={(e) => r.setTo(e.target.value)} /></label>
      <div className="flex gap-2">
        {(["week", "month"] as const).map((b) => <button key={b} className={`btn min-h-10 ${r.bucket === b ? "btn-navy" : "btn-outline"}`} onClick={() => r.setBucket(b)}>{b === "week" ? t.adm.weekly : t.adm.monthly}</button>)}
      </div>
    </div>
  );
}
const useMetrics = (r: ReturnType<typeof useRange>) =>
  useAsync<Metrics>(() => getMetrics(new Date(r.from), new Date(r.to + "T23:59:59"), r.bucket), [r.from, r.to, r.bucket]);

function Overview() {
  const { t } = useApp();
  const r = useRange();
  const { data: m, err } = useMetrics(r);
  const keys = Object.keys(t.adm.k) as (keyof typeof t.adm.k)[];
  return (
    <>
      <RangeBar r={r} />
      {err ? <Err /> : !m ? <Loading /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {keys.map((k) => {
            const v = m[k] as number | null;
            const isAvg = k.startsWith("avg_");
            return (
              <div key={k} className="card p-4">
                <div className="text-sm text-muted-foreground">{t.adm.k[k]}</div>
                <div className={`mt-1 font-bold text-navy ${isAvg && v == null ? "text-base text-muted-foreground" : "text-3xl"}`}>
                  {v == null ? t.adm.insufficient : isAvg ? `${v} ${t.adm.minutes}` : v}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t.adm.opsNote}</p>
    </>
  );
}

function SearchBox({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  const { t } = useApp();
  return (
    <div className="relative mb-3">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.adm.search} className="field ps-9" aria-label={t.adm.search} />
    </div>
  );
}

function StaffTab() {
  const { t } = useApp();
  const name = useName();
  const staff = useAsync(listStaff, []);
  const tasks = useAsync(listOpenTasks, []);
  const patients = useAsync(listPatients, []);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Staff | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const { run, node } = useAction();
  const list = (staff.data ?? []).filter((s) => (s.nameAr + s.nameEn).toLowerCase().includes(q.toLowerCase()));
  const nurses = (staff.data ?? []).filter((s) => s.role === "nurse" && s.active);
  return (
    <>
      {node}
      <SearchBox q={q} setQ={setQ} />
      {staff.err ? <Err /> : !staff.data ? <Loading /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground"><tr>
              {[t.adm.nurse + " / " + t.adm.physician, t.adm.role, t.adm.status, t.adm.patientsCount, t.adm.openReports, t.adm.openTasks, ""].map((h, i) => <th key={i} className="p-3 text-start font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3 font-semibold">{name(s)}</td>
                  <td className="p-3">{t.roles[s.role]}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${s.active ? "bg-success/15" : "bg-destructive/15 text-destructive"}`}>{s.active ? t.adm.active : t.adm.inactive}</span></td>
                  <td className="p-3">{s.patientCount}</td><td className="p-3">{s.openReports}</td><td className="p-3">{s.openTasks}</td>
                  <td className="p-3"><button className="btn btn-outline min-h-9 text-xs" onClick={() => setPending(s)}>{s.active ? t.adm.deactivate : t.adm.activate}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="mt-6 mb-2 font-bold text-navy">{t.adm.unassigned}</h2>
      <div className="card p-4 text-sm">
        {(() => {
          const phys = new Set((staff.data ?? []).filter((s) => s.role === "physician" && s.active).map((s) => s.id));
          const nur = new Set(nurses.map((s) => s.id));
          const gaps = (patients.data ?? []).filter((p) => !p.careTeam.some((x) => phys.has(x)) || !p.careTeam.some((x) => nur.has(x)));
          return gaps.length ? gaps.map((p) => <div key={p.id}>{name(p)}</div>) : t.adm.none;
        })()}
      </div>
      <h2 className="mt-6 mb-2 font-bold text-navy">{t.adm.reassignTasks}</h2>
      {tasks.err ? <Err /> : !tasks.data ? <Loading /> : tasks.data.length === 0 ? <p className="card p-4 text-sm">{t.adm.noOpenTasks}</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {tasks.data.map((tk: OpenTask) => {
            const team = patients.data?.find((p) => p.id === tk.patientId)?.careTeam ?? [];
            const options = nurses.filter((n) => n.id !== tk.nurseId && team.includes(n.id));
            return (
              <div key={tk.id} className="card p-4 text-sm">
                <div className="font-semibold">{tk.id} · {name(patients.data?.find((p) => p.id === tk.patientId))}</div>
                <div className="text-muted-foreground">{t.adm.nurse}: {name(userById(tk.nurseId))}</div>
                <div className="mt-2 flex gap-2">
                  <select className="field" value={pick[tk.id] ?? ""} onChange={(e) => setPick({ ...pick, [tk.id]: e.target.value })} aria-label={t.adm.chooseNurse}>
                    <option value="">{t.adm.chooseNurse}</option>
                    {options.map((n) => <option key={n.id} value={n.id}>{name(n)}</option>)}
                  </select>
                  <button className="btn btn-primary min-h-10" disabled={!pick[tk.id]} onClick={() => run(() => reassignTask(tk.id, pick[tk.id]!), () => { tasks.reload(); staff.reload(); })}>{t.adm.reassign}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pending && <Confirm text={pending.active ? t.adm.confirmDeactivate : t.adm.confirmActivate} onNo={() => setPending(null)}
        onYes={() => { const s = pending; setPending(null); void run(() => setStaffActive(s.id, !s.active), staff.reload); }} />}
    </>
  );
}

function PatientsTab() {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const patients = useAsync(listPatients, []);
  const accessibility = useAsync(listAccessibilityStatus, []);
  const staff = useAsync(listStaff, []);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: string; team: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { run, node } = useAction();
  const list = (patients.data ?? []).filter((p) => (p.nameAr + p.nameEn + (p.mrn ?? "")).toLowerCase().includes(q.toLowerCase()));
  const roleOf = (id: string) => staff.data?.find((s) => s.id === id)?.role;
  return (
    <>
      {node}
      <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> {t.adm.adminNoClinical}</p>
      <SearchBox q={q} setQ={setQ} />
      {patients.err ? <Err /> : !patients.data ? <Loading /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((p: PatientRow) => (
            <div key={p.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="font-bold text-navy">{name(p)}</div><div className="text-muted-foreground">{t.adm.mrn}: {p.mrn ?? "—"}</div></div>
                <button className="btn btn-outline min-h-9 text-xs" onClick={() => setEdit({ id: p.id, team: p.careTeam })}>{t.adm.editTeam}</button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <div><dt className="text-muted-foreground">{t.adm.physician}</dt><dd>{p.careTeam.filter((x) => roleOf(x) === "physician").map((x) => name(userById(x))).join("، ") || "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t.adm.nurse}</dt><dd>{p.careTeam.filter((x) => roleOf(x) === "nurse").map((x) => name(userById(x))).join("، ") || "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t.adm.openReports}</dt><dd>{p.openReports}</dd></div>
                <div><dt className="text-muted-foreground">{t.adm.openTasks}</dt><dd>{p.openTasks}</dd></div>
                <div><dt className="text-muted-foreground">{t.adm.lastUpdate}</dt><dd>{p.lastUpdate ? fmt(p.lastUpdate) : "—"}</dd></div>
                <div><dt className="text-muted-foreground">{t.adm.nextFollowup}</dt><dd>{p.nextFollowup ?? "—"}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                <Button asChild variant="outline" className="min-h-11 whitespace-normal text-start"><Link to="/records/$patientId" params={{ patientId: p.id }} search={{ section: "accessibility" }}>{t.access.title}</Link></Button>
                <span className="text-xs text-muted-foreground">{accessibility.err ? t.access.unavailable : accessibility.data === null ? t.access.loading : accessibility.data.includes(p.id) ? t.access.configured : t.access.unconfigured}</span>
              </div>
              {edit?.id === p.id && (
                <div className="mt-3 rounded-xl border p-3">
                  <div className="mb-2 font-semibold">{t.adm.careTeam}</div>
                  {(staff.data ?? []).filter((s) => s.active).map((s) => (
                    <label key={s.id} className="flex min-h-10 items-center gap-2">
                      <input type="checkbox" className="size-5" checked={edit.team.includes(s.id)}
                        onChange={(e) => setEdit({ ...edit, team: e.target.checked ? [...edit.team, s.id] : edit.team.filter((x) => x !== s.id) })} />
                      {name(s)} <span className="text-xs text-muted-foreground">({t.roles[s.role]})</span>
                    </label>
                  ))}
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-primary min-h-10" onClick={() => setConfirm(true)}>{t.adm.save}</button>
                    <button className="btn btn-outline min-h-10" onClick={() => setEdit(null)}>{t.adm.cancel}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {confirm && edit && <Confirm text={t.adm.confirmTeam} onNo={() => setConfirm(false)}
        onYes={() => { const e = edit; setConfirm(false); void run(() => setCareTeam(e.id, e.team), () => { setEdit(null); patients.reload(); }); }} />}
    </>
  );
}

function PermsTab() {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const staff = useAsync(listStaff, []);
  const audit = useAsync(listAudit, []);
  const [sel, setSel] = useState("");
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const { run, node } = useAction();
  const s = staff.data?.find((x) => x.id === sel);
  const current = (p: OptionalPermission) => (s ? (p === "approve_closure" ? s.canApproveClosure : s.permissions.includes(p)) : false);
  useEffect(() => { setDraft({}); }, [sel]);
  const changes = s ? OPTIONAL_PERMISSIONS[s.role].filter((p) => draft[p] !== undefined && draft[p] !== current(p)) : [];
  const history = (audit.data ?? []).filter((a) => a.action.startsWith("permission_") && (!sel || a.targetUserId === sel));
  return (
    <>
      {node}
      {staff.err ? <Err /> : (
        <select className="field max-w-md" value={sel} onChange={(e) => setSel(e.target.value)} aria-label={t.adm.selectStaff}>
          <option value="">{t.adm.selectStaff}</option>
          {(staff.data ?? []).map((x) => <option key={x.id} value={x.id}>{name(x)} — {t.roles[x.role]}</option>)}
        </select>
      )}
      {s && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-1 font-bold text-navy">{t.adm.mandatory}</h3>
            <p className="mb-2 text-xs text-muted-foreground">{t.adm.role}: {t.roles[s.role]}</p>
            <ul className="space-y-2 text-sm">{MANDATORY_PERMISSIONS[s.role].map((p) => <li key={p} className="flex items-center gap-2"><Lock className="size-4 text-muted-foreground" /> {t.adm.perm[p]}</li>)}</ul>
          </div>
          <div className="card p-4">
            <h3 className="mb-2 font-bold text-navy">{t.adm.optional}</h3>
            {!s.active && <p className="mb-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">{t.adm.inactiveNote}</p>}
            {OPTIONAL_PERMISSIONS[s.role].filter((p) => canHoldPermission(s.role, p)).map((p) => {
              const on = draft[p] ?? current(p);
              return (
                <label key={p} className="flex min-h-12 items-center justify-between gap-3 border-b last:border-0">
                  <span className="text-sm">{t.adm.perm[p]}</span>
                  <button type="button" role="switch" aria-checked={on} aria-label={t.adm.perm[p]} onClick={() => setDraft({ ...draft, [p]: !on })}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`}>
                    <span className={`absolute top-1 size-5 rounded-full bg-background shadow transition-all ${on ? "start-6" : "start-1"}`} />
                  </button>
                </label>
              );
            })}
            <button className="btn btn-primary mt-3 min-h-10" disabled={!changes.length} onClick={() => setConfirm(true)}>{t.adm.save}</button>
          </div>
        </div>
      )}
      <h3 className="mt-6 mb-2 font-bold text-navy">{t.adm.history}</h3>
      <AuditTable rows={history} fmt={fmt} />
      {confirm && s && <Confirm text={t.adm.confirmPerm} onNo={() => setConfirm(false)} onYes={() => {
        setConfirm(false);
        void run(async () => { for (const p of changes) await setPermission(s.id, p, !!draft[p]); }, () => { setDraft({}); staff.reload(); audit.reload(); });
      }} />}
    </>
  );
}

function AuditTable({ rows, fmt }: { rows: AuditRow[]; fmt: (s: string) => string }) {
  const { t } = useApp();
  const name = useName();
  const show = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.map((x) => name(userById(String(x)))).join("، ") : typeof v === "string" && userById(v) ? name(userById(v)) : typeof v === "boolean" ? (v ? "✓" : "✗") : typeof v === "string" ? v : JSON.stringify(v));
  if (!rows.length) return <p className="card p-4 text-sm">{t.adm.noAudit}</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground"><tr>{[t.adm.time, t.adm.action, t.adm.actor, t.adm.target, t.adm.change].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((a) => (
          <tr key={a.id} className="border-t align-top">
            <td className="whitespace-nowrap p-3">{fmt(a.at)}</td>
            <td className="p-3">{t.adm.act[a.action] ?? a.action}</td>
            <td className="p-3">{name(userById(a.actorId))}</td>
            <td className="p-3">{a.targetUserId ? name(userById(a.targetUserId)) : ""} {a.resourceType === "permission" ? `· ${t.adm.perm[a.resourceId ?? ""] ?? a.resourceId}` : a.resourceId && a.resourceType !== "staff" ? `· ${a.resourceId}` : ""}</td>
            <td className="p-3">{show(a.oldValue)} → {show(a.newValue)}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

function AuditTab() {
  const fmt = useFmtDate();
  const audit = useAsync(listAudit, []);
  const { t } = useApp();
  const [q, setQ] = useState("");
  const rows = useMemo(() => (audit.data ?? []).filter((a) => ((t.adm.act[a.action] ?? a.action) + (a.resourceId ?? "")).toLowerCase().includes(q.toLowerCase())), [audit.data, q, t]);
  return <>{audit.err ? <Err /> : !audit.data ? <Loading /> : <><SearchBox q={q} setQ={setQ} /><AuditTable rows={rows} fmt={fmt} /></>}</>;
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  const { t } = useApp();
  return (
    <div className="card p-4">
      <h3 className="mb-3 font-bold text-navy">{title}</h3>
      {empty ? <p className="grid h-48 place-items-center text-sm text-muted-foreground">{t.adm.noData}</p> : <div className="h-56" dir="ltr">{children}</div>}
    </div>
  );
}

function Analytics() {
  const { t, lang } = useApp();
  const name = useName();
  const r = useRange();
  const { data: m, err } = useMetrics(r);
  const staff = useAsync(listStaff, []);
  const lbl = (b: string) => new Date(b).toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "short" });
  const reports = (m?.report_trend ?? []).map((x) => ({ ...x, label: lbl(x.bucket) }));
  const tasks = (m?.task_trend ?? []).map((x) => ({ ...x, label: lbl(x.bucket) }));
  const ack = reports.filter((x) => x.avg_ack_minutes != null);
  const work = (staff.data ?? []).map((s) => ({ label: name(s), reports: s.openReports, tasks: s.openTasks }));
  return (
    <>
      <RangeBar r={r} />
      {err ? <Err /> : !m ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="card p-4"><div className="text-sm text-muted-foreground">{t.adm.overdueFollowups}</div><div className="text-3xl font-bold text-navy">{m.overdue_followups}</div></div>
            <div className="card p-4"><div className="text-sm text-muted-foreground">{t.adm.followupsDone}</div><div className="text-3xl font-bold text-navy">{m.followups_done}</div></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t.adm.reportVolume} empty={!reports.length}>
              <ResponsiveContainer><BarChart data={reports}><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="count" name={t.adm.count} fill="var(--color-primary)" radius={4} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title={t.adm.ackTrend} empty={!ack.length}>
              <ResponsiveContainer><LineChart data={ack}><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line dataKey="avg_ack_minutes" name={t.adm.minutes} stroke="var(--color-navy)" strokeWidth={2} /></LineChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title={t.adm.taskTrend} empty={!tasks.length}>
              <ResponsiveContainer><BarChart data={tasks}><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="created" name={t.adm.created} fill="var(--color-navy)" radius={4} /><Bar dataKey="completed" name={t.adm.completed} fill="var(--color-primary)" radius={4} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title={t.adm.workload} empty={!work.some((w) => w.reports || w.tasks)}>
              <ResponsiveContainer><BarChart data={work}><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="reports" name={t.adm.openReports} fill="var(--color-navy)" radius={4} /><Bar dataKey="tasks" name={t.adm.openTasks} fill="var(--color-primary)" radius={4} /></BarChart></ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{t.adm.opsNote}</p>
    </>
  );
}
