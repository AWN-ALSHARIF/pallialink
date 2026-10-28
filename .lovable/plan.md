# PalliaLink Care Hub — Implementation Plan

Upgrade PalliaLink with a physician Care Hub, physician-initiated nursing tasks, a unified clinical timeline, follow-up planning, and in-app notifications. No data is deleted or reseeded; the clean report dashboard is preserved.

## Why the two patients "didn't appear"

All three patients (رنا، عبدالله، سارة) already exist in the database with care teams and full medical records — they show under Medical Records. But the physician dashboard only lists *reports*, and with zero reports no patient is visible. The Care Hub fixes this by listing care-team patients directly.

## Architecture

**Reused as-is:** AppShell, cards/buttons/badges design system, i18n (`t.*` keys, Arabic-first RTL), `can_view_patient` / `is_clinician` / `current_persona` DB helpers, `clinical_entries` + `patient_profiles` (findings can be echoed into the record), the records pages, and the store's refresh-after-write pattern.

**New database objects (all additive, rerun-safe):**

| Object | Purpose |
|---|---|
| `nursing_tasks` | Physician-initiated requests: category (7 types), instructions, priority, due date, status lifecycle |
| `nursing_task_activity` | Append-only audit trail per task |
| `follow_ups` | Documented follow-up plans: purpose, responsible, target date, status, completion notes |
| `notifications` | In-app notifications carrying only references (ids), never clinical content |
| 7 security-definer RPCs | `create_nursing_task`, `nursing_task_action`, `list_care_team_nurses`, `create_followup`, `update_followup`, `list_notifications`, `mark_notifications_read` |

Task statuses: `new → acknowledged → in_progress → completed_pending_review → reviewed`, plus `unable` (with required reason). Physician `clarify` sends a completed/unable task back to `in_progress`.

**Security design:**
- Tables grant `authenticated` SELECT only; all writes go through RPCs that re-check role, active status, organization, and care-team membership — direct table writes are impossible.
- RLS: tasks/follow-ups visible only to clinicians who pass `can_view_patient` (care-team + org scoped); notifications visible only to their recipient.
- Nurses see only tasks assigned to them in the UI; physicians only patients on their care team. Role alone never grants access.
- Overdue-task notifications are generated lazily when the user loads notifications (no cron, no background jobs).
- Full SQL is in the attached proposal file: `pallialink_care_hub_proposal.sql`. Rollback = drop the 4 new tables, sequence, and 7 functions; nothing existing is touched.

## Implementation phases

**Phase 1 — Database (needs your approval):** apply the proposed migration exactly as written. No data changes.

**Phase 2 — Frontend:**
- `src/lib/tasks.ts` — data access + permission mirrors for tasks, follow-ups, notifications.
- New route `/care` — "مركز إدارة الرعاية" (physician): care-team patient cards with MRN, primary diagnosis, latest clinical update, open nursing tasks, pending reports, last/next follow-up; search + filters. No stability/urgency inference from missing data.
- Nurse dashboard — new "طلبات الأطباء" section: assigned tasks with status tabs and actions (acknowledge, start, document findings, complete, unable-with-reason).
- Patient record page — unified timeline tab merging symptom reports, nursing/physician assessments, task requests and results, care-plan updates; each event labeled by source (patient / nurse / physician). Physicians can create tasks and follow-ups from the patient profile.
- Shell — notification bell with unread count and mark-as-read.
- New i18n keys (Arabic + English); fully responsive, RTL preserved.

**Phase 3 — Testing:**
- Permission tests: nurse cannot create tasks, physician cannot ack tasks, cross-org denied, task status transitions enforced.
- Browser: all 3 patients visible; physician creates task → nurse receives/acks/completes → physician reviews; timeline updates; status persists after refresh; unauthorized access denied; existing report workflow (submit → ack → escalate → assess → close) still works; mobile/tablet/desktop viewports.

## What is NOT included

No automated reminders, no continuous monitoring, no emergency-response claims — overdue items are shown as badges/notifications only. No automatic interpretation of findings or treatment recommendations.
