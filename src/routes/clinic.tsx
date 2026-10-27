import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PainPill, StatusBadge } from "@/components/shell";
import { useApp, useFmtDate, useName, useStoreVersion } from "@/lib/app";
import { useGuard } from "@/lib/guard";
import { listReports, patientById, STATUSES, userById, type Status } from "@/lib/store";

export const Route = createFileRoute("/clinic")({
  head: () => ({
    meta: [
      { title: "Care team dashboard | PalliaLink" },
      { name: "description", content: "Review, assign and track home palliative care symptom reports." },
      { property: "og:title", content: "Care team dashboard | PalliaLink" },
      { property: "og:description", content: "A transparent workflow for symptom reports from submission to closure." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clinic,
});

function Clinic() {
  const user = useGuard("clinic");
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const v = useStoreVersion();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reports = useMemo(() => (user ? listReports(user) : []), [user, v]);
  if (!user) return null;

  const filtered = reports.filter((r) => {
    const p = patientById(r.patientId);
    const hay = `${r.id} ${p?.nameAr} ${p?.nameEn}`.toLowerCase();
    return (status === "all" || r.status === status) && hay.includes(q.trim().toLowerCase());
  });
  const count = (s: Status) => reports.filter((r) => r.status === s).length;
  const stats = [
    { label: t.totalReports, value: reports.length, tone: "text-navy" },
    { label: t.awaiting, value: count("submitted"), tone: "text-warning" },
    { label: t.inProgress, value: count("acknowledged") + count("under_review") + count("follow_up"), tone: "text-primary" },
    { label: t.closedCount, value: count("closed"), tone: "text-success" },
  ];
  const chart = STATUSES.map((s) => ({ name: t.status[s], value: count(s) }));

  return (
    <AppShell>
      <h1 className="text-3xl font-bold text-navy">{t.clinicalDashboard}</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className={`mt-1 text-4xl font-bold ${s.tone}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap gap-3 border-b p-4">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="field ps-9" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")} className="field w-auto">
              <option value="all">{t.allStatuses}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr className="text-start">
                  {["ID", t.patient, t.pain, t.status.submitted === "" ? "" : t.allStatuses.replace(/.*/, ""), t.assignee, t.date].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-start font-semibold">{i === 3 ? "" : h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono font-semibold"><Link to="/reports/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.id}</Link></td>
                    <td className="px-4 py-3 font-medium">{name(patientById(r.patientId))}</td>
                    <td className="px-4 py-3"><PainPill pain={r.pain} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.assigneeId ? name(userById(r.assigneeId)) : t.unassigned}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t.noReports}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-bold text-navy">{t.reportsByStatus}</h2>
          <div className="mt-4 h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
