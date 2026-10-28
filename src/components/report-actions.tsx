import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useApp, useFmtDate, useName } from "@/lib/app";
import {
  addAssessment, addNursingObservation, adminAssign, approveClosure, can, CLINICIANS, escalateToPhysician,
  listAssignableNurses, listAssignablePhysicians, nurseAcknowledge, patientById, physicianAcknowledge, returnAcknowledge, returnToNursing, userById,
  type Report, type User,
} from "@/lib/store";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}
function Hint({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" />{children}</p>;
}

function useRun() {
  const { t } = useApp();
  return (fn: () => Promise<unknown>, after?: () => void) => {
    fn().then(() => { after?.(); toast.success("✓"); }, () => toast.error(t.readOnly));
  };
}

/** Role-specific action panels. Every action is re-checked inside the store. */
export function RoleActions({ user, report }: { user: User; report: Report }) {
  if (user.role === "nurse") return <NurseActions user={user} r={report} />;
  if (user.role === "physician") return <PhysicianActions user={user} r={report} />;
  if (user.role === "admin") return <AdminActions user={user} r={report} />;
  return null;
}

function NurseActions({ user, r }: { user: User; r: Report }) {
  const { t } = useApp();
  const name = useName();
  const run = useRun();
  const [obs, setObs] = useState("");
  const [docs, setDocs] = useState<{ id: string; nameAr: string; nameEn: string }[]>([]);
  const [doc, setDoc] = useState("");
  const [note, setNote] = useState("");
  // Eligible physicians come from the server (active, same organization), not a hardcoded list.
  useEffect(() => {
    let live = true;
    listAssignablePhysicians(r.id).then((list) => {
      if (!live) return;
      setDocs(list);
      setDoc((cur) => cur || (list.find((d) => d.id !== r.assigneeId)?.id ?? list[0]?.id ?? ""));
    }, () => live && setDocs([]));
    return () => { live = false; };
  }, [r.id, r.assigneeId]);
  return (
    <>
      {can(user, "returnAck", r) && (
        <button className="btn btn-primary min-h-12 w-full" onClick={() => run(() => returnAcknowledge(user, r.id))}>{t.returnAckBtn}</button>
      )}
      {can(user, "nurseAck", r) && (
        <button className="btn btn-primary min-h-12 w-full" onClick={() => run(() => nurseAcknowledge(user, r.id))}>{t.nurseAck}</button>
      )}
      <Panel title={t.nursingObs}>
        <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder={t.nursingObsPh} className="field" disabled={!can(user, "nursingObs", r)} />
        <button disabled={!obs.trim() || !can(user, "nursingObs", r)} className="btn btn-primary w-full" onClick={() => run(() => addNursingObservation(user, r.id, obs), () => setObs(""))}>{t.save}</button>
      </Panel>
      <Panel title={t.escalate}>
        <select className="field" value={doc} onChange={(e) => setDoc(e.target.value)} aria-label={t.choosePhysician} disabled={!can(user, "escalate", r)}>
          {docs.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
        </select>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.noteOptional} className="field" disabled={!can(user, "escalate", r)} />
        {r.status === "submitted" && <Hint>{t.ackFirst}</Hint>}
        {r.status === "returned_to_nursing" && <Hint>{t.returnAckFirst}</Hint>}
        <button disabled={!doc || !can(user, "escalate", r) || r.assigneeId === doc} className="btn btn-navy w-full" onClick={() => run(() => escalateToPhysician(user, r.id, doc, note), () => setNote(""))}>{t.escalateBtn}</button>
      </Panel>
      <Hint>{t.physicianOnly}</Hint>
    </>
  );
}

function PhysicianActions({ user, r }: { user: User; r: Report }) {
  const { t } = useApp();
  const name = useName();
  const run = useRun();
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [nurses, setNurses] = useState<{ id: string; nameAr: string; nameEn: string }[]>([]);
  const [nurse, setNurse] = useState("");
  const [note, setNote] = useState("");
  const isMine = r.assigneeId === user.id;
  // Eligible nurses come from the server (care team, active, same organization).
  useEffect(() => {
    if (!isMine) return;
    let live = true;
    listAssignableNurses(r.id).then((l) => { if (live) { setNurses(l); setNurse((c) => c || l[0]?.id || ""); } }, () => live && setNurses([]));
    return () => { live = false; };
  }, [r.id, isMine]);
  if (!isMine) return <Hint>{t.notAssignedToYou}</Hint>;
  const canAssess = can(user, "assessment", r);
  return (
    <>
      {can(user, "physAck", r) && (
        <button className="btn btn-primary min-h-12 w-full" onClick={() => run(() => physicianAcknowledge(user, r.id))}>{t.physAck}</button>
      )}
      <Panel title={t.assessmentTitle}>
        <label className="block text-sm font-semibold">{t.assessment}</label>
        <textarea rows={3} value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder={t.assessmentPh} className="field" disabled={!canAssess} />
        <label className="block text-sm font-semibold">{t.plan}</label>
        <textarea rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={t.planPh} className="field" disabled={!canAssess} />
        <button disabled={!canAssess || !assessment.trim() || !plan.trim()} className="btn btn-primary w-full" onClick={() => run(() => addAssessment(user, r.id, assessment, plan), () => { setAssessment(""); setPlan(""); })}>{t.saveAssessment}</button>
        <p className="text-xs text-muted-foreground">{t.manualNotice}</p>
      </Panel>
      <Panel title={t.returnTitle}>
        <select className="field" value={nurse} onChange={(e) => setNurse(e.target.value)} aria-label={t.chooseNurse} disabled={!can(user, "returnToNursing", r)}>
          {nurses.map((n) => <option key={n.id} value={n.id}>{name(n)}</option>)}
        </select>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.reasonRequired} aria-label={t.reasonRequired} className="field" disabled={!can(user, "returnToNursing", r)} />
        {!can(user, "returnToNursing", r) && r.status === "awaiting_physician" && <Hint>{t.returnAfterAck}</Hint>}
        <button disabled={!nurse || !note.trim() || !can(user, "returnToNursing", r)} className="btn btn-outline w-full" onClick={() => run(() => returnToNursing(user, r.id, nurse, note), () => setNote(""))}>{t.returnBtn}</button>
      </Panel>
      <Panel title={t.approveClosure}>
        {!user.canApproveClosure ? <Hint>{t.noClosureAuth}</Hint>
          : !can(user, "approveClosure", r) ? <Hint>{t.closureAfterFollowUp}</Hint>
          : <button className="btn btn-navy w-full" onClick={() => run(() => approveClosure(user, r.id))}><ShieldCheck className="size-4" /> {t.approveClosure}</button>}
      </Panel>
    </>
  );
}

function AdminActions({ user, r }: { user: User; r: Report }) {
  const { t } = useApp();
  const name = useName();
  const run = useRun();
  const careTeam = patientById(r.patientId)?.careTeam ?? [];
  return (
    <Panel title={t.assignTo}>
      <select className="field" disabled={!can(user, "adminAssign", r)} value={r.assigneeId ?? ""} onChange={(e) => e.target.value && run(() => adminAssign(user, r.id, e.target.value))}>
        <option value="">{t.unassigned}</option>
        {CLINICIANS.filter((c) => careTeam.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{name(c)} — {t.roles[c.role]}</option>)}
      </select>
      <Hint>{t.readOnly}</Hint>
    </Panel>
  );
}

/** Nursing observations and physician assessments, visible to clinical roles. */
export function ClinicalNotes({ report }: { report: Report }) {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const obs = report.activity.filter((a) => a.type === "nursing_obs");
  const assess = report.activity.filter((a) => a.type === "assessment");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-6">
        <h2 className="font-bold text-navy">{t.nursingObs}</h2>
        <ul className="mt-3 space-y-3">
          {obs.length === 0 && <li className="text-sm text-muted-foreground">{t.noEntries}</li>}
          {obs.map((a, i) => (
            <li key={i} className="rounded-lg bg-muted p-3 text-sm">
              <p>{a.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">{name(userById(a.byUserId))} · {fmt(a.at)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="font-bold text-navy">{t.assessments}</h2>
        <ul className="mt-3 space-y-3">
          {assess.length === 0 && <li className="text-sm text-muted-foreground">{t.noEntries}</li>}
          {assess.map((a, i) => (
            <li key={i} className="rounded-lg bg-accent p-3 text-sm">
              <p><strong>{t.assessment}:</strong> {a.note}</p>
              <p className="mt-1"><strong>{t.plan}:</strong> {a.plan}</p>
              <p className="mt-1 text-xs text-muted-foreground">{name(userById(a.byUserId))} · {fmt(a.at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
