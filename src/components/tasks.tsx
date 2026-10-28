// Shared UI for nursing tasks and follow-up plans.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp, useFmtDate, useName } from "@/lib/app";
import { patientById, userById, type User } from "@/lib/store";
import {
  createFollowup, createTask, isTaskOverdue, listCareTeamNurses, listTasks,
  nurseTaskActions, physicianTaskActions, TASK_CATEGORIES, taskAction,
  type NursingTask, type TaskAction, type TaskPriority, type TaskStatus, type TaskCategory,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

const taskStatusStyle: Record<TaskStatus, string> = {
  new: "bg-warning/15 text-foreground border-warning/40",
  acknowledged: "bg-accent text-accent-foreground border-primary/30",
  in_progress: "bg-navy/10 text-navy border-navy/20",
  completed_pending_review: "bg-primary/15 text-accent-foreground border-primary/40",
  reviewed: "bg-success/15 text-foreground border-success/40",
  unable: "bg-destructive/10 text-foreground border-destructive/30",
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useApp();
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", taskStatusStyle[status])}>{t.taskStatus[status]}</span>;
}

const NEEDS_NOTE: Partial<Record<TaskAction, "required" | "optional">> = {
  complete: "required", unable: "required", clarify: "required", review: "optional",
};

export function TaskCard({ task, user, onDone }: { task: NursingTask; user: User; onDone: () => void }) {
  const { t } = useApp();
  const name = useName();
  const fmt = useFmtDate();
  const [noteFor, setNoteFor] = useState<TaskAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const actions = [...nurseTaskActions(user, task), ...physicianTaskActions(user, task)];
  const labels: Record<TaskAction, string> = {
    ack: t.taskAck, start: t.taskStart, complete: t.taskComplete,
    unable: t.taskUnable, review: t.taskReview, clarify: t.taskClarify,
  };
  const run = (a: TaskAction, n?: string) => {
    setBusy(true);
    taskAction(task.id, a, n)
      .then(() => { setNoteFor(null); setNote(""); onDone(); toast.success("✓"); })
      .catch(() => toast.error(t.readOnly))
      .finally(() => setBusy(false));
  };
  return (
    <li className="rounded-xl border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold" dir="ltr">{task.id}</span>
        <strong>{t.taskCat[task.category]}</strong>
        <TaskStatusBadge status={task.status} />
        {task.priority === "urgent" && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{t.priority.urgent}</span>}
        {isTaskOverdue(task) && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">{t.overdue}</span>}
      </div>
      <p className="mt-2">{task.instructions}</p>
      <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>{t.patient}: <span className="font-medium text-foreground">{name(patientById(task.patientId))}</span></div>
        <div>{t.requestingPhysician}: <span className="font-medium text-foreground">{name(userById(task.physicianId))}</span></div>
        <div>{t.assignedNurse}: <span className="font-medium text-foreground">{name(userById(task.nurseId))}</span></div>
        <div>{t.taskDue}: <span className="font-medium text-foreground">{task.dueAt ? fmt(task.dueAt) : "—"}</span></div>
      </dl>
      {task.findings && <p className="mt-2 rounded-lg bg-muted/60 p-2"><span className="font-semibold">{t.taskFindings.replace(" (مطلوب)", "").replace(" (required)", "")}: </span>{task.findings}</p>}
      {task.unableReason && <p className="mt-2 rounded-lg bg-destructive/10 p-2"><span className="font-semibold">{t.taskUnable}: </span>{task.unableReason}</p>}
      {task.reviewNote && <p className="mt-2 rounded-lg bg-accent/60 p-2"><span className="font-semibold">{t.taskReview}: </span>{task.reviewNote}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{fmt(task.createdAt)}</p>
      {actions.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a} disabled={busy}
                className={cn("btn min-h-10", a === "ack" || a === "start" || a === "complete" || a === "review" ? "btn-primary" : "btn-outline")}
                onClick={() => (NEEDS_NOTE[a] ? (setNoteFor(noteFor === a ? null : a), setNote("")) : run(a))}>
                {labels[a]}
              </button>
            ))}
          </div>
          {noteFor && (
            <div className="space-y-2">
              <textarea rows={3} className="field" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={noteFor === "complete" ? t.taskFindings : noteFor === "unable" ? t.taskUnableReason : noteFor === "clarify" ? t.taskClarifyNote : t.taskReviewNote}
                aria-label={labels[noteFor]} />
              <div className="flex gap-2">
                <button className="btn btn-primary min-h-10" disabled={busy || (NEEDS_NOTE[noteFor] === "required" && !note.trim())} onClick={() => run(noteFor, note)}>{t.save}</button>
                <button className="btn btn-outline min-h-10" onClick={() => setNoteFor(null)}>{t.cancel}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Nurse dashboard section: tasks assigned to this nurse, with status filter. */
export function NurseTasksSection({ user }: { user: User }) {
  const { t } = useApp();
  const [tasks, setTasks] = useState<NursingTask[] | null>(null);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const reload = () => listTasks().then((all) => setTasks(all.filter((x) => x.nurseId === user.id)), () => setTasks([]));
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user.id]);
  if (!tasks) return null;
  const shown = tasks.filter((x) => filter === "all" || x.status === filter);
  const counts = (s: TaskStatus) => tasks.filter((x) => x.status === s).length;
  return (
    <section className="card mt-6 p-5">
      <h2 className="font-bold text-navy">{t.nursingTasks}</h2>
      <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="tablist">
        {(["all", ...["new", "acknowledged", "in_progress", "completed_pending_review", "reviewed", "unable"] as TaskStatus[]] as const).map((s) => (
          <button key={s} role="tab" aria-selected={filter === s} onClick={() => setFilter(s)}
            className={cn("btn min-h-10 shrink-0 text-xs", filter === s ? "btn-navy" : "btn-outline")}>
            {s === "all" ? t.filterAll : t.taskStatus[s]} <span className="rounded-full bg-background/20 px-2">{s === "all" ? tasks.length : counts(s)}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {shown.map((x) => <TaskCard key={x.id} task={x} user={user} onDone={reload} />)}
        {shown.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">{t.noTasks}</li>}
      </ul>
    </section>
  );
}

/** Physician dialog: create a nursing task for a patient on their care team. */
export function NewTaskForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { t } = useApp();
  const [nurses, setNurses] = useState<{ id: string; nameAr: string; nameEn: string }[]>([]);
  const [nurseId, setNurseId] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general_followup");
  const [priority, setPriority] = useState<TaskPriority>("routine");
  const [due, setDue] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { listCareTeamNurses(patientId).then((n) => { setNurses(n); setNurseId(n[0]?.id ?? ""); }, () => setNurses([])); }, [patientId]);
  const submit = () => {
    setBusy(true);
    createTask(patientId, nurseId, category, instructions.trim(), priority, due ? new Date(due).toISOString() : null)
      .then(() => { onDone(); toast.success("✓"); })
      .catch(() => toast.error(t.readOnly))
      .finally(() => setBusy(false));
  };
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-bold text-navy">{t.newTask}</h2>
      <label className="block text-sm font-semibold">{t.assignedNurse}
        <select className="field mt-1" value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
          {nurses.map((n) => <option key={n.id} value={n.id}>{n.nameAr} — {n.nameEn}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">{t.taskCategory}
        <select className="field mt-1" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
          {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{t.taskCat[c]}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">{t.taskPriority}
          <select className="field mt-1" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            <option value="routine">{t.priority.routine}</option>
            <option value="urgent">{t.priority.urgent}</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">{t.taskDue}
          <input type="datetime-local" className="field mt-1" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <textarea rows={3} className="field" placeholder={t.taskInstructionsPh} aria-label={t.taskInstructions}
        value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      <button className="btn btn-primary w-full" disabled={busy || !nurseId || !instructions.trim()} onClick={submit}>{t.createTask}</button>
      <p className="text-xs text-muted-foreground">{t.manualNotice}</p>
    </section>
  );
}

/** Physician dialog: create a documented follow-up plan. */
export function NewFollowUpForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const { t } = useApp();
  const name = useName();
  const team = (patientById(patientId)?.careTeam ?? []).map((id) => userById(id)).filter((u) => u && (u.role === "nurse" || u.role === "physician"));
  const [purpose, setPurpose] = useState("");
  const [responsible, setResponsible] = useState(team[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    createFollowup(patientId, purpose.trim(), responsible, date)
      .then(() => { onDone(); toast.success("✓"); })
      .catch(() => toast.error(t.readOnly))
      .finally(() => setBusy(false));
  };
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-bold text-navy">{t.newFollowUp}</h2>
      <label className="block text-sm font-semibold">{t.followUpPurpose}
        <input className="field mt-1" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">{t.followUpResponsible}
          <select className="field mt-1" value={responsible} onChange={(e) => setResponsible(e.target.value)}>
            {team.map((u) => <option key={u!.id} value={u!.id}>{name(u)} · {t.roles[u!.role]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">{t.followUpDate}
          <input type="date" className="field mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <button className="btn btn-primary w-full" disabled={busy || !purpose.trim() || !responsible || !date} onClick={submit}>{t.save}</button>
    </section>
  );
}
