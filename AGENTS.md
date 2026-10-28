<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Reports live in the Cloud database; UI only calls `src/lib/store.ts`, whose in-memory cache is a read-only mirror refreshed after each write (never write whole datasets back — that caused stale-tab overwrites).
- All report writes go through security-definer DB functions (`submit_report`, `report_action`) that re-check role/assignment/status; tables grant authenticated SELECT only, gated by RLS `can_view_patient`. Demo personas are real auth accounts via `demoSignIn` server fn.
- All UI copy goes through `src/lib/i18n.ts` (Arabic default, RTL); never hardcode strings in components.
- Report visibility is report-level (`can_view_report`): physicians see only reports assigned to or acknowledged by them; patient-level `can_view_patient` is org-scoped. Mirror both in `store.ts` `canViewReport`/`canViewPatient`.
- Nurse and physician acknowledgments are separate columns; assignment to a physician sets `awaiting_physician` and never acknowledges on the physician's behalf.
- Eligible physicians come from the `list_assignable_physicians` RPC, never a hardcoded/care-team list.
- Return to nursing uses its own states (`returned_to_nursing` → nurse `returnAck` → `nursing_follow_up`); never reuse `acknowledged`. Physician acks/assessments are never cleared by a return.
- Medical record = `patient_profiles` + append-only `clinical_entries` (+ private `clinical-documents` bucket, path `<patient_id>/...`); UI goes through `src/lib/emr.ts`, writes only via `emr_add_entry`/`emr_update_profile`. Missing data renders as "not documented"; explicit negatives are stored as entries (e.g. allergy status `none_known`).
- Report voice messages live in the private `report-audio` bucket (path `<patient_id>/<uuid>`), linked via `reports.audio_path`; read only through short-lived signed URLs gated by `can_view_report`, validated in `submit_report`. Why: recordings are PHI and must follow report-level access.
- Nursing tasks, follow-ups and notifications live in `nursing_tasks` / `nursing_task_activity` / `follow_ups` / `notifications`; UI goes through `src/lib/tasks.ts`, writes only via `create_nursing_task` / `nursing_task_action` / `create_followup` / `update_followup` / `list_notifications` / `mark_notifications_read` (all re-check role, active status, org and care-team membership). Task lifecycle: new → acknowledged → in_progress → completed_pending_review → reviewed, plus unable; physician `clarify` returns to in_progress. Notifications carry ids only, never clinical content; overdue flags are generated lazily inside `list_notifications`.
