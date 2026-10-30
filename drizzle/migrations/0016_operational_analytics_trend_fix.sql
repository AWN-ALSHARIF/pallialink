-- Fix admin_operational_metrics trend bucket: the escalations subquery referenced
-- the ungrouped outer column r.created_at (SQLSTATE 42803). Rewritten with a CTE.
-- Read-only function replacement; no data or policy changes.

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

    'nurse_ack', (SELECT jsonb_build_object(
        'avg_minutes', round(avg(extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'median_minutes', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'p90_minutes', round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1),
        'n', count(*))
      FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.nurse_ack_at IS NOT NULL AND r.created_at BETWEEN p_from AND p_to
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

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

    'stalled', (SELECT count(*) FROM reports r JOIN patients p ON p.id = r.patient_id
      WHERE p.org_id = me.org_id AND r.status <> 'closed'
        AND coalesce((SELECT max(a.at) FROM report_activity a WHERE a.report_id = r.id), r.created_at) < now() - stall
        AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),

    'trend', (WITH scoped AS (
        SELECT r.* FROM reports r JOIN patients p ON p.id = r.patient_id
        WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
          AND (p_staff IS NULL OR r.assignee_id = p_staff OR r.nurse_ack_by = p_staff OR r.physician_ack_by = p_staff)),
      agg AS (
        SELECT date_trunc(b, s.created_at) AS bucket,
               count(*) AS submitted,
               count(*) FILTER (WHERE s.status = 'closed') AS closed,
               round(avg(extract(epoch FROM s.nurse_ack_at - s.created_at)/60)
                     FILTER (WHERE s.nurse_ack_at IS NOT NULL)::numeric, 1) AS avg_nurse_ack_minutes,
               round(avg(extract(epoch FROM
                     (SELECT min(a.at) FROM report_activity a
                      WHERE a.report_id = s.id
                        AND ((a.type = 'status' AND a.status = 'closed') OR a.type = 'closure_approved'))
                     - s.created_at)/60) FILTER (WHERE s.status = 'closed')::numeric, 1) AS avg_resolution_minutes
        FROM scoped s GROUP BY 1)
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'bucket', agg.bucket,
          'submitted', agg.submitted,
          'closed', agg.closed,
          'escalations', (SELECT count(*) FROM report_activity a JOIN scoped s2 ON s2.id = a.report_id
                          WHERE a.type IN ('escalated','assigned')
                            AND date_trunc(b, s2.created_at) = agg.bucket),
          'avg_nurse_ack_minutes', agg.avg_nurse_ack_minutes,
          'avg_resolution_minutes', agg.avg_resolution_minutes) ORDER BY agg.bucket), '[]')
      FROM agg),

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