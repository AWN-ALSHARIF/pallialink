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
- Back navigation uses the router's visited history indices in an identity-scoped memory ledger, with conservative role-dashboard fallbacks; resource authorization stays in the data layer. Why: preserve actual list context without cross-account history or unsafe deep-link fallbacks.
- Dirty forms use router/local discard dialogs; record tabs use search state. Why: preserve drafts and context.
- Patient tracking projects the mirror only until safe RPC rollout. Why: UI omission is not backend privacy.
- Patient display adaptation uses an identity-scoped memory-only provider and root data attributes; refresh after checked preference saves and clear on identity changes. Why: apply preferences across patient routes without offline PHI or cross-account leakage.
- Pictogram requests use existing checked report submission with explicit patient-entered pain and non-diagnostic notes, routed to the nursing queue and physician assignment workflow. Why: preserve existing schema and report-level authorization without fabricating severity or diagnoses.
- Access+ uses separate staff support and patient-choice tables through src/lib/accessibility.ts checked RPCs; require explicit dedicated permission and current same-org care-team scope for staff edits, and never cache sensitive preferences offline. Why: preserve clinical records and isolate patient self-service from staff authority.
- Accessibility copy is composed into the central i18n dictionary from accessibility-i18n.ts. Why: keep one translation entry point while containing the feature vocabulary.
- Reports live in the Cloud database; UI only calls `src/lib/store.ts`, whose in-memory cache is a read-only mirror refreshed after each write (never write whole datasets back — that caused stale-tab overwrites).
- All report writes go through security-definer DB functions (`submit_report`, `report_action`) that re-check role/assignment/status; tables grant authenticated SELECT only, gated by RLS `can_view_patient`. Demo personas are real auth accounts via `demoSignIn` server fn.
- All UI copy goes through `src/lib/i18n.ts` (Arabic default, RTL); never hardcode strings in components.
- Report visibility is report-level (`can_view_report`): physicians see only reports assigned to or acknowledged by them; patient-level `can_view_patient` is org-scoped. Mirror both in `store.ts` `canViewReport`/`canViewPatient`.
- Nurse and physician acknowledgments are separate columns; assignment to a physician sets `awaiting_physician` and never acknowledges on the physician's behalf.
- Eligible physicians come from the `list_assignable_physicians` RPC, never a hardcoded/care-team list.
- Return to nursing uses its own states (`returned_to_nursing` → nurse `returnAck` → `nursing_follow_up`); never reuse `acknowledged`. Physician acks/assessments are never cleared by a return.
- Medical record = `patient_profiles` + append-only `clinical_entries` (+ private `clinical-documents` bucket, path `<patient_id>/...`); UI goes through `src/lib/emr.ts`, writes only via `emr_add_entry`/`emr_update_profile`. Missing data renders as "not documented"; explicit negatives are stored as entries (e.g. allergy status `none_known`).
- Report media uses private `report-images`/`report-audio`, ordered `report_attachments` and legacy audio columns through checked `submit_report_multimodal`; signed reads follow `can_view_report`. Draft requests stay identity-scoped in memory. Why: preserve combined media, legacy access and privacy.
- Nursing tasks, follow-ups and notifications live in `nursing_tasks` / `nursing_task_activity` / `follow_ups` / `notifications`; UI goes through `src/lib/tasks.ts`, writes only via `create_nursing_task` / `nursing_task_action` / `create_followup` / `update_followup` / `list_notifications` / `mark_notifications_read` (all re-check role, active status, org and care-team membership). Task lifecycle: new → acknowledged → in_progress → completed_pending_review → reviewed, plus unable; physician `clarify` returns to in_progress. Notifications carry ids only, never clinical content; overdue flags are generated lazily inside `list_notifications`.
- Org admin features live in `/admin` and `src/lib/admin.ts`, calling checked `admin_*` RPCs only; optional delegated permissions are `can_approve_closure` (closure, physicians only) plus `staff_permissions`, and every admin/closure/reassign action writes append-only `admin_audit_log`. Why: one authorization system, enforced in the database.
- Task, follow-up and notification reads use identity-scoped memory-only caches with short freshness, in-flight deduplication and invalidation after writes/sign-in/sign-out; never persist clinical caches offline or share them across accounts.
- Startup resolves persona and its authorized report mirror together to avoid serial duplicate persona reads; refresh timestamps advance only on successful complete reads.
- Demo login groups are derived from existing persona IDs, not duplicate account records; pending sign-in prevents competing account switches and exposes recoverable errors.
