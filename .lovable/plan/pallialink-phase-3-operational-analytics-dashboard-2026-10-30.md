# PalliaLink — Phase 3: Operational Analytics Dashboard

## Goal
Add an "Operational Analytics" (التحليلات التشغيلية) section inside the existing Organization Command Center (`/admin`), driven by real report/audit timestamps — no fictional numbers, no new third-party services (recharts is already installed and used).

## What exists today
- `/admin` already has an `analytics` tab using `admin_metrics(from, to, bucket)` (basic counts, avg nurse ack, weekly trends).
- `reports` carries `created_at`, `nurse_ack_at`, `physician_ack_at`; `report_activity` carries timestamped events (`created, status, assigned, escalated, assessment, returned, return_ack, closure_approved, …`).
- All admin RPCs are SECURITY DEFINER, gated by `_require_admin()` (active admin, same org).

## Proposed changes

### 1. Database (requires your approval — full SQL in `pallialink-phase3-analytics-proposed.sql`)
Two new SECURITY DEFINER functions, same authorization pattern as existing `admin_*` RPCs. **No new tables, no RLS changes, no data writes, no destructive operations.** Both are read-only (`STABLE`) and org-scoped.

- **`admin_operational_metrics(p_from, p_to, p_bucket, p_stall_hours, p_staff)`** returns JSONB:
  - Current status counts: total, awaiting nursing ack, awaiting physician ack, under review, nursing follow-up, returned, closed.
  - Timing metrics, each with **avg / median / p90 / sample size n**, excluding incomplete timestamp pairs:
    - Nursing ack time = `nurse_ack_at − created_at`
    - Physician ack time = `physician_ack_at −` latest escalation/assignment event to that physician (falls back to report creation when the escalation event is missing, and reports that in a separate counter)
    - Submission → first physician assessment = first `assessment` activity `at − created_at`
    - Resolution time = closure event `at − created_at`
  - Escalation % (reports with ≥1 escalation event ÷ total in range).
  - Closure rate (closed ÷ total in range).
  - Stalled reports: open reports whose last activity is older than `p_stall_hours` (configurable threshold; operational indicator only, not a clinical urgency score).
  - Trend buckets (day/week/month): submissions, closures, escalations, avg ack times, avg resolution.
  - Open reports per assigned staff member.
  - Optional `p_staff` filter (nurse/physician) restricting the report set.
- **`admin_pending_actions()`** returns JSONB with:
  - `reports`: every open report with id, status, responsible staff member, minutes elapsed since the relevant workflow event, and last recorded action.
  - `followups`: planned follow-ups with responsible person, target date, overdue flag.
- Grants: `REVOKE ALL … FROM anon; GRANT EXECUTE TO authenticated;` — identical to existing admin functions; the admin check happens inside the function, so a non-admin caller gets `forbidden` even via direct API calls.

### 2. Frontend (no approval needed, built after SQL approval)
- New `operations` tab in `/admin` (التحليلات التشغيلية), reusing existing card/chart/range conventions:
  - Metric cards with sample sizes shown under each average.
  - Recharts visualizations (mobile-responsive via existing `ResponsiveContainer` pattern): submissions over time, reports by status, nurse/physician ack time trends, resolution trend, escalation frequency, open reports by assignee.
  - Filters: last 7 / 30 / 90 days, custom range, staff member filter. Organization is fixed to the admin's own org by the backend.
  - Pending Actions panel: grouped lists (awaiting nurse ack / physician ack / assessment / returned to nursing / follow-ups) with report id, status, responsible person, elapsed time, last action; each row links to the existing report page.
  - A visible note that these are operational measurements, not clinical outcomes.
- All copy through `src/lib/i18n.ts` (Arabic default + English), RTL preserved.
- New unit tests next to existing ones for the metric-mapping layer (sample-size display, null-pair exclusion, threshold logic).

### 3. Verification (after approval)
- Browser test as admin: tab renders, filters work, pending panel links open reports.
- Direct RPC test as non-admin → `forbidden`.
- Mobile viewport check (390px) — no horizontal overflow.
- Existing test suite must stay green.

## Explicitly NOT in scope (per spec)
- No automatic clinical urgency scoring or medical decision-making.
- No claims about clinical outcomes.
- No changes to workflow transitions, RLS policies, or existing data.
- No publishing without your explicit request.

## Risks / notes
- Historical reports with missing escalation events: physician-ack time falls back to submission time and is counted separately — never silently treated as zero.
- Functions are read-only; rerunning the migration is safe (`CREATE OR REPLACE`).
- Rollback: `DROP FUNCTION admin_operational_metrics(...); DROP FUNCTION admin_pending_actions();` — no data is touched.
