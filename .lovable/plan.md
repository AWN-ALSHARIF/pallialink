# Return-to-nursing workflow and patient medical record

**Nothing has been applied.** Approve each database file separately. Existing reports, notes, assignments and history are kept. The demo reset is never run.

## What exists today
- **Return to nursing:** the database sets the status back to the generic "acknowledged", and a reason is optional. There is no separate nurse acknowledgment for a returned report, and no "returned" filter or counter.
- **Medical record:** not built. Phase 2 and Phase 3 were proposed but never approved or applied, so there is no medical record data and no "الملف الطبي" screen. Today a clinician sees only the patient's name, age and a one-line condition.

## Part A: return to nursing (`pallialink_phase2a_return_to_nursing.sql`)
**New states**
- `returned_to_nursing`, shown as "أُعيد إلى التمريض".
- `nursing_follow_up`, shown as "قيد متابعة التمريض", after the nurse acknowledges the return.

**Flow**
1. Only the assigned physician can return a report, and only after acknowledging it.
2. They pick an eligible nurse (active, same organization, on the patient's care team) and must write a reason. The nurse list comes from a protected server lookup.
3. The report goes to that nurse with status "أُعيد إلى التمريض". It shows on the nurse dashboard in a new "Needs action" filter, with a counter. The physician's reason is shown prominently on the report.
4. Only that nurse can acknowledge the return. This is recorded separately (who and when) from the original nursing acknowledgment, and the status becomes "قيد متابعة التمريض".
5. The nurse can escalate again. The normal flow continues: "بانتظار استلام الطبيب", then physician acknowledgment, then "قيد مراجعة الطبيب".
6. The physician's earlier acknowledgment, assessments and notes are never changed. That physician can still open the report after returning it.
7. History records who returned it, to whom, when and why, plus the return acknowledgment.

**Existing reports keep their current status.** Nothing is moved into the new states.

## Part B: medical record (`pallialink_phase2b_medical_record_v2.sql`)
**Changes from the earlier Phase 2 file**
- Physicians can edit every profile field. Each edit is kept in history with the changed values.
- "Documented negative" (for example, an allergy entry "No known drug allergies") is shown differently from "Not documented" (nothing recorded).

**Stored per patient**
- Profile: record number, demographics, primary and secondary diagnoses, past medical and surgical history, family and social history, palliative diagnosis, goals of care and preferences.
- Clinical entries (append-only): medications (current and previous), drug allergies, vitals, labs and investigations, nursing notes, physician assessments, care plans, home visits and documents.
- Every entry records who wrote it and when. Access is logged.

**Who sees what (enforced by the database)**
- Care-team nurses and physicians in the same organization see the whole record. A physician also sees it while assigned an open report for that patient.
- Patients and caregivers see their own summary, allergies, medications and care plans only.
- Everyone else is refused.

**Writing**
- Nurses: vitals, nursing notes, visits, allergies and documents.
- Physicians: assessments, care plans, medications, labs and profile edits.

**Documents:** a private storage area with the same access rules. Uploaded files can't be changed.

## Part C: demo records (`pallialink_phase3_synthetic_data_v2.sql`)
- Labeled `[DEMO]` profiles and a few entries per patient, including one documented "no known drug allergies".
- A second test organization with one nurse and one patient, used to prove cross-organization access is refused.
- Inserts only.

## Screens
- **Report page:**
  - A banner with the return reason, who returned it and when.
  - "Acknowledge returned report" button for the selected nurse.
  - The return panel requires a reason and lists eligible nurses from the server.
  - "Open medical record" button.
- **Nurse dashboard:**
  - "Needs action" filter covering new reports, reports returned to her, and her own follow-ups.
  - Counters, status filter and chart include the new states.
- **New "الملف الطبي" tab** on the nurse and physician dashboards:
  - Patient list, then a patient page with a summary header (record number, age, diagnoses, allergies with a "documented negative" or "not documented" label, care status).
  - Tabs for history, medications, allergies, investigations, notes and assessments, care plans and goals, documents, and previous reports with the pain chart.
  - A searchable chronological timeline that merges entries, reports and workflow events.
  - Tabs load only when opened. Forms to add entries by role, and a profile editor for physicians.
- Arabic RTL and English text throughout. "Synthetic data" badge on every record.

## Testing
**Browser, as each demo user, with refreshes:**
- Physician returns a report with a reason, and the nurse sees "أُعيد إلى التمريض" and the reason.
- Nurse acknowledges it ("قيد متابعة التمريض"), then escalates to the other physician, who acknowledges it.
- The first physician's assessment is still on the report.
- Nurse and physician open the medical record and add entries, and the entries are still there after refresh.
- The physician edits the profile, and the edit is still there after refresh.
- The test-organization nurse is refused access to these records.

**Automated:** permission-rule tests for the new transitions.

**Still unverified unless you ask for more:** file upload in a real browser on a phone, and accessibility.

## Order after approval
Apply Part A, then build and test it. Apply Part B and Part C, then build and test the medical record. Then report what passed and what is still unverified.
