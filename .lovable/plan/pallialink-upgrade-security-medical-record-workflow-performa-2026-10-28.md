# PalliaLink upgrade: security, medical record, workflow, performance

Pre-pilot MVP with synthetic data only. This plan does not make the app safe for real patients: that still needs a formal security review, privacy compliance and clinical validation.

**Nothing has been applied.** Each database phase needs your separate "approved".

## What I found
- **Physician sees unrelated reports:** physician access is checked per patient, so one assigned report reveals every report for that patient.
- **No organization boundary:** there are no organizations at all, and admins can see everything.
- **Nurse escalation:** the server doesn't check the nurse's care team. The status jumps to "Acknowledged" with no separate physician step.
- **Only one physician in the list:** the nurse's dropdown only shows physicians on the patient's care team (p1/p2 → Dr. Fahad, p3 → Dr. Lama). Both accounts are set up correctly.
- **Demo reset:** any signed-in user, even a patient, can wipe all reports.
- **Slowness:** every write and every window focus reloads every report and every history entry. Startup makes an extra sign-in check over the network. Security checks run per row without supporting indexes. Every update re-renders every page.

## Before you approve: backup
1. Note the latest daily backup under **More → Database → Manage → Backups**.
2. Take a full export: **More → Database → Manage → Settings → Export project data → Export data → Database → Export → Start export**. Download it.
3. Phase 1 also saves its own snapshot of the original report statuses, assignees and function definitions, so the rollback script can restore exact values.

## Database phases (SQL files in Files)

**Phase 1: security and workflow** (`..._phase1_security_workflow.sql`)
- Adds organizations, plus organization and active flags for users and patients. All current data goes into one "Demo organization".
- Adds the "awaiting physician" status, and separate nurse and physician acknowledgment (who and when).
- Fills in acknowledgment history only from audit entries by the correct role. A physician entry counts only if that physician was assigned at the time. Anything without evidence stays blank.
- **Only change to existing data:** reports already assigned to a physician but not acknowledged by that physician become "awaiting physician". Each one gets a history entry, and the original value is saved first.
- Report-level access: a physician sees only reports assigned to them or that they acknowledged.
- Every check is limited to the same organization, and inactive accounts are refused.
- Escalation needs a care-team nurse, a report already acknowledged by a nurse, and an active physician in the same organization.
- The physician list comes from a protected server lookup that returns only names and IDs.
- Function permissions are locked down. Demo reset works only for an admin in an organization marked as demo.

**Phase 2: medical record** (`..._phase2_medical_record.sql`)
- **Patient profile:** record number, demographics, diagnoses, history, goals of care and preferences.
- **Clinical entries:** one append-only list for allergies, medications, vitals, labs, nursing notes, physician assessments, care plans, home visits and documents.
  - Every entry records who wrote it and when. Corrections add a new entry linked to the old one, and nothing is edited or deleted.
- **Who can write what:** nurses add vitals, nursing notes, visits, allergies and documents. Physicians add those (except nursing notes) plus assessments, care plans, medications and labs. Physicians edit the profile.
- **Patients and caregivers:** they see their profile, allergies, medications and care plans only.
- **Access log:** opening a record and adding entries are logged. Admins can view the log.
- **Documents:** stored privately with the same access rules. They can't be changed once uploaded.

**Phase 3: synthetic demo records** (`..._phase3_synthetic_data.sql`): inserts only.
- Labeled `[DEMO]` placeholder profiles and a few entries per patient, with no real clinical content.
- Optionally, a second test organization with one nurse and one patient, used for the cross-organization denial tests.

**Rollback** (`..._rollback.sql`)
- Restores the saved report values, function definitions and access rules.
- One lossy step: reports created after Phase 1 that are "awaiting physician" become "acknowledged".
- New tables and columns are left in place but unused.

## App changes (after each approval)
1. **Workflow screens:**
   - New status labels: "بانتظار استلام الطبيب" and "قيد مراجعة الطبيب".
   - The nurse dropdown lists every eligible physician from the server.
   - Physicians see an acknowledge button only while a report is awaiting them.
   - The report page shows who acknowledged it and when, for nurse and physician separately.
2. **"الملف الطبي" tab** on the nurse and physician dashboards:
   - Lists the patients each clinician can access.
   - Patient page: summary header, then sections for history, medications, allergies, investigations, notes, care plans and previous reports.
   - Searchable timeline, and a pain trend chart from recorded reports.
   - "Open medical record" link on every report.
   - Sections load only when opened.
   - Synthetic-data badge.
3. **Speed:**
   - Load one page of reports at a time, and each report's history only when it's opened.
   - Merge repeated reloads, and limit reloads on window focus.
   - Read the session locally instead of over the network.
   - Cache each medical record section.
   - Re-render only the parts of the screen that changed.
   - Measure page-load and request counts in the browser before and after, and report the real numbers only.
4. All new text in Arabic and English; Arabic RTL design unchanged.

## Testing
- **Automated, against the real database:**
  - Both physicians, nurse acknowledge and escalate, and physician-specific queues.
  - Physician acknowledgment, assessment, closure, and still closed after refresh.
  - Physician denied an unrelated report of the same patient.
  - Cross-organization denial, direct calls with forbidden actions, and the patient-reset block.
  - Medical record read and write by role.
  - Historical data unchanged apart from the documented status change.
- **Automated, in the app code:** the permission rules.
- **Browser runs:** desktop and phone screenshots, plus timing.
- **Still manual for you:** real-device use, accessibility review, and clinical review of wording.

## Order
Phase 1 approval → apply → workflow, speed and tests → report back. Then Phase 2 approval → record screens. Then Phase 3 approval → demo records.
