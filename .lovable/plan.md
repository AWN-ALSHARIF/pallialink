# PalliaLink Access+ — Phase 1

## Approval boundary
The architecture review and complete SQL proposal are prepared. **No database, permissions, security functions, patient configurations, or application interfaces have been changed for Access+.** Approval of this plan authorizes only the attached `pallialink-access-plus-phase1-proposed.sql` and implementation below. It does **not** authorize suggested demo configurations, automatic permission grants, or publishing.

## Existing architecture and findings
- Patient records already use `patients`, `patient_profiles`, append-only `clinical_entries`, and checked EMR functions. Accessibility support will not be recorded as diagnoses or clinical entries.
- Organization administration already uses protected `staff_permissions`, checked `admin_*` functions, and `admin_audit_log`. Its current permission constraint accepts only `reassign_reports`, so the new permission requires an explicitly approved constraint expansion.
- Taleen is active in the demonstration organization and already belongs to p1, p2, and p3 care teams. Preserve this membership and her nursing role.
- Existing physician patient access can include an open assigned report without care-team membership. Access+ deliberately requires **current care-team membership** for physician/nurse reads and edits, plus same organization, so report assignment alone will not expose these profiles.

## What to build
### Patient record tab
Add **إمكانية الوصول والتواصل / Accessibility & Communication** to the existing patient record, preserving Arabic-first RTL and the current visual design.
- Accessibility support needs: multiple selections for speech/communication, visual, hearing, motor, cognitive, digital assistance, and other with optional description. No diagnosis inference.
- Communication methods: text, pictures, phrases, voice, text-to-speech, screen reader, existing authorized caregiver assistance, and other. Select a primary method from enabled alternatives; never disable alternatives by selecting it.
- Independent staff-recommended interface settings: text size, control size, contrast, reduced motion, simplified navigation, step-by-step reporting, visual notifications, and screen-reader-friendly interaction.
- Optional support instructions; neutral review status, last update, author, and optional next review date. No mandatory clinical review schedule.
- Scoped modification history; view-only for staff without edit permission; loading, unavailable, validation, save, and concurrent-edit conflict states.

### Dedicated opt-in permission
Add `manage_patient_accessibility` to both nurse and physician optional permission controls in the existing command center.
- Only active same-organization administrators can grant/revoke it for existing nurse/physician staff.
- Both physicians and nurses need an explicit grant **and** current same-organization care-team membership to edit.
- Administrators view profiles, configuration status and history, and manage grants; they do not gain clinical-profile editing privileges implicitly.
- No initial grants, including for either nurse or physician. Testing will grant/revoke narrowly through checked administration controls and record resulting audit events.

### Patient self-service
Add personal settings to the existing patient dashboard for text size, contrast, reduced motion, simplified navigation, communication alternatives and primary method.
- Only the patient can save their own choices; a separate patient-scoped function cannot update staff notes, needs, review information or permissions.
- Staff recommendations and patient overrides remain separate. Personal selections take precedence when later adaptive interfaces consume them.
- Phase 1 stores/manages choices; full application-wide adaptation, AAC, speech synthesis and redesigned symptom reporting remain future work.
- Caregivers receive no new access or editing privileges; selecting caregiver-assisted communication does not authorize a caregiver.

### Command center
- Add a per-patient profile shortcut and configured/not-configured indicator to the existing patient list.
- Show no disability categories, support notes or sensitive history in organization-wide summaries/analytics.
- Reuse permission grant/revoke history and existing audit view; show detailed changes only within the scoped patient profile.

## Proposed database changes and affected objects
Complete SQL: attached **pallialink-access-plus-phase1-proposed.sql** (proposal only).
- Create `patient_accessibility_profiles`: one staff-managed support profile per existing patient.
- Create `patient_interface_preferences`: one separate set of patient-controlled choices per existing patient.
- Create `patient_accessibility_history`: scoped, append-only snapshots for both sources.
- Each table references the existing patient; organization is derived from that patient rather than copied into an independently editable field. No duplicate patient identities or clinical profiles.
- Add authenticated SELECT grants and scoped SELECT RLS; service-role grants; no anonymous grants and no direct authenticated write grants/policies.
- Expand `staff_permissions_permission_check` to allow the dedicated permission; retain existing grants and policies.
- Replace `admin_set_permission` preserving closure/reassignment branches and audit behavior, adding the new opt-in grant/revoke branch and null-input rejection.
- Add narrowly scoped authorization helpers, structured interface validation, checked staff save and checked patient save functions. Revoke default public/anonymous execution, explicitly allow authenticated execution. Every save re-checks active identity, organization and scope.
- Saves use revision conflict detection and patient-row locking; save and both audit records are one transaction.
- Existing `admin_audit_log` receives revision/change metadata only; sensitive before/after details remain in the patient-scoped history table.
- Do not modify existing `can_view_patient`, `can_view_report`, role assignments, security policies, clinical entries, care teams, accounts, reports, tasks or audio.
- No suggested demo values or permission rows inserted by the migration.

## Risks and compatibility
- New support notes/history are sensitive: staff/admin read scope is intentionally narrow; patients can read their personal settings but not staff support notes. No public display or offline persistence.
- Replacing the permission function is security-sensitive; preserve and regression-test its old closure/reassignment behaviors. The constraint drop is only replacement of the permission allowlist, not deletion of rows or revocation of existing permissions.
- Existing rows satisfy the widened allowlist. New schema is additive and does not rename/drop clinical tables/columns.
- Raw SQL is not independently rerunnable after successful application. Apply once using recorded migration history; failed atomic application rolls back. Read back actual schema after approval rather than trusting a migration result alone.
- Before application capture the existing permission function definition and permission allowlist. For rollback, disable new interfaces and revoke save-function execution through separately approved SQL; retain patient profiles/history rather than deleting sensitive data. Restore the old permission function only after reviewing any new grants. No destructive rollback is authorized here.
- Backend is shared by preview and published app: approved changes affect both, even without publishing frontend code.

## Technical implementation
- Reuse existing client/RPC conventions and introduce one focused accessibility data module and reusable profile/settings sections. Keep all UI copy in `i18n.ts`.
- Query permission capability from the database, not hardcoded users or browser storage. UI capability hints never replace function authorization.
- Keep reads identity-scoped and memory-only; invalidate after saves, permission edits and identity changes; no sensitive localStorage/offline cache.
- Record module boundaries in `AGENTS.md`; keep existing routing and unique route metadata. All schema changes use the approved migration tool; never alter generated client/types manually.

## Verification after approval
1. Admin opens profiles/status/history and manages grants within its organization.
2. Explicitly permitted physician edits a care-team patient; ungranted physician and assigned-report-only non-team physician are denied.
3. Ungranted nurse is denied, including direct RPC; granted nurse edits care-team patients only.
4. Patient saves only personal choices; forged staff fields and another patient's identifier are denied.
5. Anonymous, inactive, unrelated staff, caregiver and cross-organization reads/writes are denied through actual database requests.
6. Settings survive refresh, sign-out/sign-in and a fresh browser; conflicts prevent stale-tab overwrite.
7. Patient-scoped history and metadata-only admin audit read back after authorized edits, with original actor and timestamps.
8. Compare existing clinical/report/task data before and after; verify physician/nurse workflows and Taleen's command-center visibility remain intact.
9. Test Arabic RTL forms, multi-select/primary-method consistency, keyboard use and mobile/desktop fit; capture interface evidence.
10. Keep focused permission/value tests in the project, run relevant existing regressions, and inspect build/runtime signals.

## Pending decisions and limitations
No question is needed to choose defaults. **Explicit approval of the complete SQL is required before implementation of persistence/security.** Suggested Rana/Abdullah/Sara configurations remain unapplied unless separately approved. Before approved implementation, authorization, persistence, history and screenshots of new interfaces are not yet verified. No publishing will occur.