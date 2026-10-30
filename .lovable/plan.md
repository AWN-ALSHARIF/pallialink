# PalliaLink Phase 4 — workflow, patient tracking and safe navigation

## Approval boundary
The architecture inspection is complete. **No application code, database records, security policies or deployment have been changed.** The complete proposed SQL is attached as `pallialink-phase4-proposed.sql`; approving this plan authorizes that schema/security proposal and its separately executed, display-name-only transaction. No reset, reseeding, clinical backfill, new account or automatic publication is included.

## Findings that affect implementation
- Patient/caregiver sessions currently load raw reports and report activity. Those rows include internal return reasons, staff notes and plans even though the patient dashboard hides them. Tracking must use an explicit safe projection and deny raw reads for those roles.
- Some existing escalation/admin-assignment branches clear physician acknowledgment columns. Preserve previous acknowledgment values and events; distinguish current assignment acknowledgment from historical acknowledgment.
- Task actions lack fresh care-team/organization validation and row locking. Tighten those checks within the requested workflow changes.
- Existing notifications are task-oriented and not clickable; add unique event keys and current-scope checks. Patient history needs separate list/details and actual milestones instead of the ordered status strip.
- The existing physician is `u-doc2`, currently ريما سالم / Reema Salem, active in the demonstration organization. Rename only Arabic/English display fields and the matching existing source persona.

## What will be built

### 1. Operational workflow monitoring and notifications
- Configure separate thresholds for nursing acknowledgment, physician acknowledgment, physician review, return-to-nursing, nursing-task completion and follow-up completion within the existing command center.
- Use minutes and an approaching-threshold percentage, with server-side bounds. **No clinical thresholds or demo values are invented or seeded.** Unconfigured stages and missing timestamp evidence are labeled explicitly rather than shown as on time.
- Use actual submission, assignment, acknowledgment/return and task timestamps; incidental notes do not reset a pending-action clock. Explicit task due times and existing follow-up target dates remain applicable. The proposal interprets date-only follow-up deadlines as the end of that UTC date; disclose that convention in controls and tests.
- Show on-time / approaching / overdue indicators as operational delay only, never symptom triage or severity prioritization.
- Add role-scoped, clickable notifications for new reports, escalation, returns, assignment changes, tasks/follow-ups and operational approaching/overdue actions. Keep read/unread states and transactional deduplication; retain historical notification rows.
- Immediate assignment notifications come from database events. Time-based notices are evaluated when the signed-in staff refreshes notifications, with modest polling while the page is visible plus focus refresh. No unattended alerts, external messaging or push delivery.

### 2. Shift handover and safe assignment
- Add a staff handover screen listing active assigned reports, pending acknowledgments, tasks/follow-ups, last documented action and current responsible staff.
- Store resource-linked handover notes, author, recipient, creation timestamp and recipient acknowledgment separately. Handover creation and acknowledgment **never change assignment or clinical status**.
- Confidential handover content is accessible only to its currently authorized clinical participants, not patients/caregivers or organizational administrators. Admin analytics receive counts/timing only.
- Reassignment is a separate explicit command, using active, same-organization, professional-role and current care-team validation. Staff need the existing delegated reassignment permission; admins may manage assignment within the current professional stage but cannot escalate clinically, return clinically, assess or close.
- Preserve acknowledgment history in activity plus assignment snapshots. Physician reassignment requires a fresh acknowledgment, determined from the current assignment episode, not simply an old non-null timestamp. Task reassignment returns eligible open tasks to `new`, preserving prior timestamps in history and requiring the replacement nurse's actual acknowledgment/start. Do not reset existing rows during migration.

### 3. Patient and linked-caregiver report tracking
- Add dedicated **بلاغاتي** list and report-detail pages: original symptoms, explicit pain score, patient-entered notes/audio, submission time, patient-friendly current state, actual chronological milestones and last update.
- Filters: all, active, completed; default ordering: most recent activity. Preserve filter context when returning.
- Map all eight existing states exactly:
  - `submitted`: تم إرسال البلاغ
  - `acknowledged`: تم استلام البلاغ من التمريض
  - `awaiting_physician`: تمت إحالة البلاغ للطبيب
  - `under_review`: البلاغ قيد مراجعة الطبيب
  - `follow_up`: جارٍ متابعة البلاغ
  - `returned_to_nursing`: أُحيل البلاغ للمتابعة التمريضية
  - `nursing_follow_up`: جارٍ تنفيذ المتابعة التمريضية
  - `closed`: تم إغلاق البلاغ
- Only the existing patient identity or explicitly linked caregiver can read that patient's reports. The safe read contract excludes staff notes/plans, handovers, actor identifiers and administrative actions. No new patient-visible clinical-feedback field is introduced.
- Connect dashboard, new report, My Reports, details and existing Access+ settings with touch-friendly navigation. Preserve existing saved patient adaptations and empty states.

### 4. Universal Back navigation
- Reuse TanStack Router history and scroll restoration. Add a shared RTL-aware, accessible Back control to secondary screens and appropriate close/back behavior to nested tabs/dialogs.
- Prefer the actual previous authorized in-app location. Use a safe role-specific dashboard when directly opened, when history leads outside the app or when a prior route is inaccessible. Clear identity-scoped navigation context on account changes.
- Store list/tab/filter context in router search/state, not a second navigation stack or offline medical cache. Preserve browser Back/Forward behavior.
- Use router blockers and accessible confirmation dialogs for dirty report/audio, clinical documentation, task/follow-up, accessibility, handover and administration forms. Browser unload uses the browser-native warning where supported. Confirm before dismissing dirty dialogs; successful saves do not trigger false warnings.

### 5. Existing operational analytics and physician rename
- Extend the existing Operational Analytics view; do not build another analytics dashboard. Add pending acknowledgments, overdue/approaching actions, unassigned reports, pending handovers, average handover acknowledgment with sample count, and open tasks/follow-ups.
- Use the same SQL calculation for staff indicators and admin counts. Pending counts are current; handover averages use handovers created in the selected period with actual acknowledgment timestamps. No samples renders unavailable, not zero.
- Update only `u-doc2` display names to **مسك عادل / Misk Adel**, retaining credentials, identity, organization, permissions, care teams, responsibilities and all historical events. Resolve actor names consistently in directories/dropdowns/report history without editing event identifiers or timestamps.

## Technical changes and compatibility
- New tables: `workflow_thresholds`, `workflow_assignment_history`, `workflow_handovers`, each with explicit grants, RLS and checked writes.
- Add nullable notification event/resource/key columns and a partial unique index on new event keys; no legacy-row cleanup. Add event triggers only on application-owned public tables.
- Checked RPCs cover safe patient reads, monitoring, handovers, eligible recipients, reassignment and metrics. Compatible replacements update existing report/task/follow-up/notification/physician-lookup functions. Internal helpers remain non-callable; policy helpers return caller-scoped booleans.
- Restrictive patient/caregiver raw-report/activity SELECT policies; notification visibility rechecks present scope. Existing storage/report-level audio authorization stays unchanged.
- Update the shared shell, store/adapters, translations, dashboards, details, forms and operations view; add focused tracking, workflow, handover and navigation modules/routes. Generated clients/types/router tree stay tool-managed.
- New/changed content routes receive app-specific metadata; preserve the existing Arabic RTL medical design.
- Archive pre-change function/policy definitions and account/assignment metadata before approved execution. DDL is additive and transactional; rollback is a separately approved forward correction, not deleting new history or loosening privacy silently.
- **Compatibility risk:** the published old frontend still queries raw report tables. Applying the restrictive policies before an updated frontend is published would make patient report history unavailable there. Before any shared-database change, explicitly agree on the rollout window; publication still requires a separate explicit request. Do not automatically publish or silently accept a published-site interruption.
- Physician eligibility becomes current care-team scoped; changing teams may revoke access to future assignment options. Show only server-authorized candidates and keep old history intact.
- Proposed SQL syntax has been parsed locally; it has not been executed or runtime/security-tested. Test authorization, triggers, concurrency and readback after approval before claiming completion.

## Verification and delivery
- Run focused unit tests for all eight exact status mappings, linked-patient visibility, milestone filtering, operational boundaries/clock selection, assignment eligibility, handover no-transfer semantics and navigation fallback/dirty forms.
- Exercise the actual patient → nurse acknowledgment → escalation → physician acknowledgment/assessment → closure → patient refresh flow; verify original report and caregiver readback. Keep synthetic test records, labeled as verification data; do not delete/reset them.
- Test direct unauthorized reads/writes, scope revocation, raw patient-access denial, private handovers, fake recipients, duplicate acknowledgments and concurrent notifications.
- Verify assignment/permission/account metadata before and after rename; audit entries, persistence after refresh/account changes, notifications and analytics agree.
- Browser-test iPhone-sized 390×844, Android-sized 360×800, tablet 820×1180 and desktop 1440×900 in Arabic/English. Physical iOS/Android system navigation and speech recording remain unverified without device access; report this rather than claiming those tests passed.
- Deliver completed-feature/file/change/test/security/rename results, limitations, any remaining approvals and publication readiness. No automatic publishing.