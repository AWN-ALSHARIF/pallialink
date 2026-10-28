# Organization Command Center & Staff Permissions

Proposal only. No database change is applied until you approve. Full SQL: `pallialink_command_center_proposal.sql` (in Files).

## What exists today (reused)
- Admin عون الشريف already signs in and sees an "all reports" dashboard; admin can reassign reports (`adminAssign`).
- Closure approval already exists as a per-physician flag (منوال = allowed, ريما = not allowed) and is checked inside the database at closure time. This stays the single closure mechanism — no second system.
- Deactivated staff are already locked out instantly (every check requires an active account).
- Gap found: admin reassignment does not check that the new assignee belongs to the same organization or care team, and it clears an existing physician acknowledgment. Both fixed in this proposal.

## New admin area (`/admin`, admin-only, Arabic RTL, navy/teal)
Tabs, each its own page section, all searchable and mobile-friendly:
1. **مركز قيادة المنظمة** — 11 live indicators, date range, weekly/monthly trends. Averages with no data show "بيانات غير كافية", never 0.
2. **إدارة الفريق الطبي** — physicians/nurses with status, patient count, open reports/tasks; activate/deactivate (with confirmation); reassign open nursing tasks.
3. **إدارة المرضى** — name, record number, care team, open reports, open tasks, last update, next follow-up; edit care team. No clinical notes, history or recordings shown here.
4. **إدارة الصلاحيات** — choose a staff member, see mandatory role permissions (locked, labeled) and optional delegated ones as toggles: closure approval (physicians only) and report reassignment (both). Save after confirmation; history listed below.
5. **التحليلات والتقارير** — report volume, acknowledgment time, task completion, overdue follow-ups, workload per staff member, with empty states and a note that these are operational, not clinical-quality, measures.
6. **سجل التدقيق والأمان** — every permission grant/revoke, account change, care-team change, report/task reassignment and closure approval, with actor, time, target, old → new value.

## Security rules (enforced in the database)
- Only an active admin of the same organization can call admin functions; staff cannot change their own permissions; admins cannot edit themselves.
- Nurses can never receive closure approval. Permissions never bypass care-team, organization or report-status rules.
- Admins gain no clinical abilities from managing permissions.
- Audit log is read-only for everyone in the app; only the checked functions write it.

## Effects on existing data
- Nothing deleted or reset. Existing reports, records, tasks, recordings unchanged.
- Current closure settings (منوال yes, ريما no) kept as-is.
- Optional: today admins can open patient medical records. Removing that is a stricter policy change I will only make if you ask.

## Rollback & backup
- Before applying: save the current report-closure/assignment function to the existing backup table and export `app_users` + `patients` to CSV in Files.
- Rollback removes the new functions, restores the saved function; new tables can be kept or exported and removed. Every UI change records its previous value in the audit log for reversal.

## Testing after approval
The 16 checks in your request, run in the browser and via direct calls (including rejected calls by nurse/physician, revoke-then-close attempt, refresh persistence, and phone/tablet/desktop sizes), reported as passed / failed / not run.
