-- Phase 3: Operational Analytics — read-only reporting functions.
-- No new tables, no RLS changes, no data writes. Admin-only via _require_admin(), org-scoped.

CREATE OR REPLACE FUNCTION public.admin_operational_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text DEFAULT 'day',
  p_stall_hours integer DEFAULT 24,
  p_staff text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me app_users := _require_admin();
  b  text := CASE WHEN p_bucket IN ('day','week','month') THEN p_bucket ELSE 'day' END;
  stall interval := make_interval(hours => greatest(coalesce(p_stall_hours, 24), 1));
BEGIN
  RETURN jsonb_build_object(
    -- Current workflow state counts (queue as it is now, not date-limited).
    'status_counts', (SELECT jsonb_build_object(
        'total', count(*),
        'submitted', count(*) FILTER (WHERE r.status = 'submitted'),
        'acknowledged', count(*) FILTER (WHERE r.status = 'acknowledged'),
        'awaiting_physician', count(*) FILTER (WHERE r.status = 'awaiting_physician'),
        'under_review', count(*) FILTER (WHERE r.status = 'under_review'),
        'follow_up', count(*) FILTER (WHERE r.status = 'follow_up'),
        'returned_to_nursing', count(*) FILTER (WHERE r.status = 'returned_to_nursing'),
        'nursing_follow_up', count(*) FILTER (WHERE r.status = 'nursing_follow_up'),
        'closed', count(*) FILTER (WHERE r.status = 'closed'))
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    -- Nursing ack time = nurse_ack_at - created_at (incomplete pairs excluded).
    'nurse_ack', (SELECT jsonb_build_object(
        'avg_minutes', round(avg(extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'p90_minutes', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'n', count(*))
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.nurse_ack_at IS NOT NULL AND r.created_at BETWEEN p_from AND p_to
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    -- Physician ack time = physician_ack_at - latest escalation/assignment event to that
    -- physician at or before the ack. Reports missing that event are excluded and counted.
    'physician_ack', (WITH pairs AS (
        SELECT r.id,
               extract(epoch FROM r.physician_ack_at -
                 (SELECT max(a.at) FROM report_activity a
                  WHERE a.report_id = r.id AND a.type IN ('escalated','assigned')
                    AND a.assignee_id = r.physician_ack_by AND a.at <= r.physician_ack_at))/60 AS minutes
        FROM reports r JOIN patients p ON p.id = r.patient_id
        WHERE p.org_id = me.org_id AND r.physician_ack_at IS NOT NULL AND r.created_at BETWEEN p_from AND p_to
          AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff))
      SELECT jsonb_build_object(
        'avg_minutes', round(avg(minutes) FILTER (WHERE minutes IS NOT NULL)::numeric, 1),
        'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE minutes IS NOT NULL)::numeric, 1),
        'p90_minutes', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE minutes IS NOT NULL)::numeric, 1),
        'n', count(minutes),
        'missing_escalation', count(*) FILTER (WHERE minutes IS NULL))
      FROM pairs),

    -- Submission -> first physician assessment.
    'submission_to_review', (WITH pairs AS (
        SELECT r.id,
               extract(epoch FROM
                 (SELECT min(a.at) FROM report_activity a
                  WHERE a.report_id = r.id AND a.type = 'assessment') - r.created_at)/60 AS minutes
        FROM reports r JOIN patients p ON p.id = r.patient_id
        WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
          AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff))
      SELECT jsonb_build_object(
        'avg_minutes', round(avg(minutes)::numeric, 1),
        'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::numeric, 1),
        'p90_minutes', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)::numeric, 1),
        'n', count(minutes))
      FROM pairs),

    -- Resolution = first closure event - submission.
    'resolution', (WITH pairs AS (
        SELECT r.id,
               extract(epoch FROM
                 (SELECT min(a.at) FROM report_activity a
                  WHERE a.report_id = r.id
                    AND ((a.type = 'status' AND a.status = 'closed') OR a.type = 'closure_approved'))
                 - r.created_at)/60 AS minutes
        FROM reports r JOIN patients p ON p.id = r.patient_id
        WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
          AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff))
      SELECT jsonb_build_object(
        'avg_minutes', round(avg(minutes)::numeric, 1),
        'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)::numeric, 1),
        'p90_minutes', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)::numeric, 1),
        'n', count(minutes))
      FROM pairs),

    -- Escalation share and closure rate over reports created in range.
    'escalation_pct', (SELECT round(100.0 * count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM report_activity a
          WHERE a.report_id = r.id AND a.type IN ('escalated','assigned')
            AND a.assignee_id IN (SELECT persona_id FROM app_users WHERE role = 'physician')))
        / nullif(count(*), 0), 1)
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    'closure_rate_pct', (SELECT round(100.0 * count(*) FILTER (WHERE r.status = 'closed')
        / nullif(count(*), 0), 1)
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    -- Stalled: open reports whose last activity (or creation) is older than the threshold.
    'stalled', (SELECT count(*) FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.status <> 'closed'
        AND coalesce((SELECT max(a.at) FROM report_activity a WHERE a.report_id = r.id), r.created_at) < now() - stall
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    -- Trend buckets.
    'trend', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'bucket'), '[]') FROM (
        SELECT jsonb_build_object(
          'bucket', date_trunc(b, r.created_at),
          'submitted', count(*),
          'closed', count(*) FILTER (WHERE r.status = 'closed'),
          'escalations', (SELECT count(*) FROM report_activity a
                          JOIN reports r2 ON r2.id = a.report_id
                          JOIN patients p2 ON p2.id = r2.patient_id
                          WHERE a.type IN ('escalated','assigned')
                            AND p2.org_id = me.org_id
                            AND date_trunc(b, r2.created_at) = date_trunc(b, r.created_at)),
          'avg_nurse_ack_minutes', round(avg(extract(epoch FROM r.nurse_ack_at - r.created_at)/60)
                                         FILTER (WHERE r.nurse_ack_at IS NOT NULL)::numeric, 1),
          'avg_resolution_minutes', round(avg(extract(epoch FROM
                 (SELECT min(a.at) FROM report_activity a
                  WHERE a.report_id = r.id
                    AND ((a.type = 'status' AND a.status = 'closed') OR a.type = 'closure_approved'))
                 - r.created_at)/60) FILTER (WHERE r.status = 'closed')::numeric, 1)) x
        FROM reports r JOIN patients p ON p.id = r.patient_id
        WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
          AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)
        GROUP BY date_trunc(b, r.created_at)) s),

    -- Open reports per assigned staff member (names resolved client-side).
    'by_assignee', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'assignee_id', s.assignee_id, 'open_reports', s.cnt) ORDER BY s.cnt DESC), '[]')
      FROM (SELECT r.assignee_id, count(*) cnt FROM reports r
            JOIN patients p ON p.id = r.patient_id
            WHERE p.org_id = me.org_id AND r.status <> 'closed' AND r.assignee_id IS NOT NULL
              AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)
            GROUP BY r.assignee_id) s)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.admin_operational_metrics(timestamptz, timestamptz, text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_operational_metrics(timestamptz, timestamptz, text, integer, text) TO authenticated;

-- Pending actions queue: open reports with responsible person, elapsed time, last action;
-- plus planned follow-ups. Read-only, org-scoped, admin-only.
CREATE OR REPLACE FUNCTION public.admin_pending_actions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me app_users := _require_admin();
BEGIN
  RETURN jsonb_build_object(
    'reports', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'elapsed_minutes')::numeric DESC), '[]') FROM (
      SELECT jsonb_build_object(
        'report_id', r.id,
        'patient_id', r.patient_id,
        'status', r.status,
        'category', CASE r.status
          WHEN 'submitted' THEN 'awaiting_nurse_ack'
          WHEN 'awaiting_physician' THEN 'awaiting_physician_ack'
          WHEN 'under_review' THEN 'needs_assessment'
          WHEN 'returned_to_nursing' THEN 'returned_to_nursing'
          WHEN 'nursing_follow_up' THEN 'nursing_follow_up'
          ELSE 'open' END,
        'responsible_id', coalesce(r.assignee_id,
          CASE WHEN r.status IN ('submitted','returned_to_nursing','nursing_follow_up')
               THEN (SELECT u.persona_id FROM app_users u
                     WHERE u.role = 'nurse' AND u.active AND u.org_id = me.org_id
                       AND r.patient_id IN (SELECT p2.id FROM patients p2 WHERE p2.id = r.patient_id AND u.persona_id = ANY (p2.care_team))
                     LIMIT 1)
          END),
        'elapsed_minutes', round(extract(epoch FROM now() - coalesce(
          (SELECT max(a.at) FROM report_activity a WHERE a.report_id = r.id), r.created_at))/60),
        'last_action', (SELECT jsonb_build_object('type', a.type, 'at', a.at, 'by', a.by_user_id)
                        FROM report_activity a WHERE a.report_id = r.id
                        ORDER BY a.at DESC LIMIT 1)) x
      FROM reports r
      JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.status <> 'closed') s),

    'followups', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id,
        'patient_id', f.patient_id,
        'purpose', f.purpose,
        'responsible_id', f.responsible_id,
        'target_date', f.target_date,
        'overdue', f.target_date < current_date) ORDER BY f.target_date), '[]')
      FROM follow_ups f
      JOIN patients p ON p.id = f.patient_id
      WHERE p.org_id = me.org_id AND f.status = 'planned')
  );
END
$function$;

REVOKE ALL ON FUNCTION public.admin_pending_actions() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_pending_actions() TO authenticated;