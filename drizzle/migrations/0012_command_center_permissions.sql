CREATE TABLE IF NOT EXISTS public.staff_permissions (
  persona_id text NOT NULL REFERENCES public.app_users(persona_id),
  permission text NOT NULL CHECK (permission IN ('reassign_reports')),
  granted_by text NOT NULL REFERENCES public.app_users(persona_id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (persona_id, permission)
);
GRANT SELECT ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perms visible to self or org admin" ON public.staff_permissions FOR SELECT TO authenticated
USING (persona_id = (public.current_persona()).persona_id
   OR ((public.current_persona()).role = 'admin'
       AND EXISTS (SELECT 1 FROM public.app_users s WHERE s.persona_id = staff_permissions.persona_id
                   AND s.org_id = (public.current_persona()).org_id)));

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigserial PRIMARY KEY,
  org_id text NOT NULL REFERENCES public.organizations(id),
  actor_id text NOT NULL REFERENCES public.app_users(persona_id),
  action text NOT NULL,
  target_user_id text REFERENCES public.app_users(persona_id),
  resource_type text,
  resource_id text,
  old_value jsonb,
  new_value jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit visible to org admin" ON public.admin_audit_log FOR SELECT TO authenticated
USING ((public.current_persona()).role = 'admin' AND org_id = (public.current_persona()).org_id);

CREATE OR REPLACE FUNCTION public._require_admin() RETURNS public.app_users
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := current_persona();
BEGIN
  IF me.persona_id IS NULL OR me.role <> 'admin' OR NOT me.active THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN me;
END $$;
REVOKE EXECUTE ON FUNCTION public._require_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._require_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(p_persona text, p_perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM staff_permissions sp JOIN app_users u ON u.persona_id = sp.persona_id
                 WHERE sp.persona_id = p_persona AND sp.permission = p_perm AND u.active)
$$;

CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(persona_id text, role text, name_ar text, name_en text, active boolean,
              can_approve_closure boolean, permissions text[], patient_count int,
              open_reports int, open_tasks int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.persona_id, s.role, s.name_ar, s.name_en, s.active, s.can_approve_closure,
    coalesce((SELECT array_agg(p.permission) FROM staff_permissions p WHERE p.persona_id = s.persona_id), '{}'),
    (SELECT count(*)::int FROM patients pt WHERE pt.org_id = s.org_id AND s.persona_id = ANY(pt.care_team)),
    (SELECT count(*)::int FROM reports r WHERE r.assignee_id = s.persona_id AND r.status <> 'closed'),
    (SELECT count(*)::int FROM nursing_tasks t WHERE (t.nurse_id = s.persona_id OR t.physician_id = s.persona_id)
       AND t.status NOT IN ('reviewed'))
  FROM app_users s, (SELECT * FROM public._require_admin()) me
  WHERE s.org_id = me.org_id AND s.role IN ('nurse','physician')
  ORDER BY s.role, s.persona_id
$$;

CREATE OR REPLACE FUNCTION public.admin_set_permission(p_persona text, p_permission text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := _require_admin(); s app_users; was boolean;
BEGIN
  SELECT * INTO s FROM app_users WHERE persona_id = p_persona;
  IF s.persona_id IS NULL OR s.org_id <> me.org_id OR s.persona_id = me.persona_id
     OR s.role NOT IN ('nurse','physician') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_permission = 'approve_closure' THEN
    IF s.role <> 'physician' THEN RAISE EXCEPTION 'forbidden'; END IF;
    was := s.can_approve_closure;
    UPDATE app_users SET can_approve_closure = p_enabled WHERE persona_id = p_persona;
  ELSIF p_permission = 'reassign_reports' THEN
    was := EXISTS (SELECT 1 FROM staff_permissions WHERE persona_id = p_persona AND permission = p_permission);
    IF p_enabled THEN
      INSERT INTO staff_permissions(persona_id, permission, granted_by) VALUES (p_persona, p_permission, me.persona_id)
      ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM staff_permissions WHERE persona_id = p_persona AND permission = p_permission;
    END IF;
  ELSE RAISE EXCEPTION 'invalid'; END IF;
  IF was IS DISTINCT FROM p_enabled THEN
    INSERT INTO admin_audit_log(org_id, actor_id, action, target_user_id, resource_type, resource_id, old_value, new_value)
    VALUES (me.org_id, me.persona_id, CASE WHEN p_enabled THEN 'permission_grant' ELSE 'permission_revoke' END,
            p_persona, 'permission', p_permission, to_jsonb(was), to_jsonb(p_enabled));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_staff_active(p_persona text, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := _require_admin(); s app_users;
BEGIN
  SELECT * INTO s FROM app_users WHERE persona_id = p_persona;
  IF s.persona_id IS NULL OR s.org_id <> me.org_id OR s.persona_id = me.persona_id
     OR s.role NOT IN ('nurse','physician') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF s.active = p_active THEN RETURN; END IF;
  UPDATE app_users SET active = p_active WHERE persona_id = p_persona;
  INSERT INTO admin_audit_log(org_id, actor_id, action, target_user_id, resource_type, resource_id, old_value, new_value)
  VALUES (me.org_id, me.persona_id, CASE WHEN p_active THEN 'staff_activate' ELSE 'staff_deactivate' END,
          p_persona, 'staff', p_persona, to_jsonb(s.active), to_jsonb(p_active));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_care_team(p_patient text, p_team text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := _require_admin(); pat patients; bad int;
BEGIN
  SELECT * INTO pat FROM patients WHERE id = p_patient;
  IF pat.id IS NULL OR pat.org_id <> me.org_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(*) INTO bad FROM unnest(p_team) x
    WHERE NOT EXISTS (SELECT 1 FROM app_users u WHERE u.persona_id = x AND u.org_id = me.org_id
                      AND u.active AND u.role IN ('nurse','physician'));
  IF bad > 0 OR cardinality(p_team) > 10 THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE patients SET care_team = coalesce((SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_team) x), '{}') WHERE id = p_patient;
  INSERT INTO admin_audit_log(org_id, actor_id, action, resource_type, resource_id, old_value, new_value)
  VALUES (me.org_id, me.persona_id, 'care_team_change', 'patient', p_patient, to_jsonb(pat.care_team), to_jsonb(p_team));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reassign_task(p_task text, p_nurse text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := _require_admin(); t nursing_tasks; pat patients; n app_users;
BEGIN
  SELECT * INTO t FROM nursing_tasks WHERE id = p_task;
  SELECT * INTO pat FROM patients WHERE id = t.patient_id;
  SELECT * INTO n FROM app_users WHERE persona_id = p_nurse;
  IF t.id IS NULL OR pat.org_id <> me.org_id OR t.status IN ('reviewed','completed_pending_review')
     OR n.persona_id IS NULL OR n.role <> 'nurse' OR NOT n.active OR n.org_id <> me.org_id
     OR NOT (n.persona_id = ANY(pat.care_team)) OR n.persona_id = t.nurse_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE nursing_tasks SET nurse_id = p_nurse WHERE id = p_task;
  INSERT INTO nursing_task_activity(task_id, by_user_id, type, status, note) VALUES (p_task, me.persona_id, 'reassigned', t.status, NULL);
  INSERT INTO notifications(user_id, patient_id, kind, ref_id) VALUES (p_nurse, t.patient_id, 'task_assigned', p_task);
  INSERT INTO admin_audit_log(org_id, actor_id, action, target_user_id, resource_type, resource_id, old_value, new_value)
  VALUES (me.org_id, me.persona_id, 'task_reassign', p_nurse, 'nursing_task', p_task, to_jsonb(t.nurse_id), to_jsonb(p_nurse));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_open_tasks()
RETURNS TABLE(id text, patient_id text, nurse_id text, category text, status text, due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.patient_id, t.nurse_id, t.category, t.status, t.due_at
  FROM nursing_tasks t JOIN patients pt ON pt.id = t.patient_id, (SELECT * FROM public._require_admin()) me
  WHERE pt.org_id = me.org_id AND t.status IN ('new','acknowledged','in_progress','unable')
  ORDER BY t.id
$$;

CREATE OR REPLACE FUNCTION public.admin_patient_overview()
RETURNS TABLE(patient_id text, name_ar text, name_en text, mrn text, care_team text[],
              open_reports int, open_tasks int, last_update timestamptz, next_followup date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pt.id, pt.name_ar, pt.name_en, pp.mrn, pt.care_team,
    (SELECT count(*)::int FROM reports r WHERE r.patient_id = pt.id AND r.status <> 'closed'),
    (SELECT count(*)::int FROM nursing_tasks t WHERE t.patient_id = pt.id AND t.status NOT IN ('reviewed')),
    greatest((SELECT max(a.at) FROM report_activity a JOIN reports r ON r.id = a.report_id WHERE r.patient_id = pt.id),
             (SELECT max(a.at) FROM nursing_task_activity a JOIN nursing_tasks t ON t.id = a.task_id WHERE t.patient_id = pt.id)),
    (SELECT min(f.target_date) FROM follow_ups f WHERE f.patient_id = pt.id AND f.status = 'planned')
  FROM patients pt LEFT JOIN patient_profiles pp ON pp.patient_id = pt.id, (SELECT * FROM public._require_admin()) me
  WHERE pt.org_id = me.org_id ORDER BY pt.id
$$;

CREATE OR REPLACE FUNCTION public.admin_metrics(p_from timestamptz, p_to timestamptz, p_bucket text DEFAULT 'week')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := _require_admin(); b text := CASE WHEN p_bucket = 'month' THEN 'month' ELSE 'week' END;
BEGIN
  RETURN jsonb_build_object(
    'patients', (SELECT count(*) FROM patients WHERE org_id = me.org_id),
    'active_physicians', (SELECT count(*) FROM app_users WHERE org_id = me.org_id AND role = 'physician' AND active),
    'active_nurses', (SELECT count(*) FROM app_users WHERE org_id = me.org_id AND role = 'nurse' AND active),
    'open_reports', (SELECT count(*) FROM reports r JOIN patients p ON p.id = r.patient_id WHERE p.org_id = me.org_id AND r.status <> 'closed'),
    'awaiting_physician', (SELECT count(*) FROM reports r JOIN patients p ON p.id = r.patient_id WHERE p.org_id = me.org_id AND r.status = 'awaiting_physician'),
    'active_tasks', (SELECT count(*) FROM nursing_tasks t JOIN patients p ON p.id = t.patient_id WHERE p.org_id = me.org_id AND t.status IN ('new','acknowledged','in_progress')),
    'overdue_tasks', (SELECT count(*) FROM nursing_tasks t JOIN patients p ON p.id = t.patient_id WHERE p.org_id = me.org_id AND t.status IN ('new','acknowledged','in_progress') AND t.due_at < now()),
    'pending_reviews', (SELECT count(*) FROM nursing_tasks t JOIN patients p ON p.id = t.patient_id WHERE p.org_id = me.org_id AND t.status = 'completed_pending_review'),
    'closed_reports', (SELECT count(*) FROM reports r JOIN patients p ON p.id = r.patient_id WHERE p.org_id = me.org_id AND r.status = 'closed' AND r.created_at BETWEEN p_from AND p_to),
    'avg_ack_minutes', (SELECT round(avg(extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1) FROM reports r JOIN patients p ON p.id = r.patient_id WHERE p.org_id = me.org_id AND r.nurse_ack_at IS NOT NULL AND r.created_at BETWEEN p_from AND p_to),
    'avg_task_minutes', (SELECT round(avg(extract(epoch FROM t.completed_at - t.created_at)/60)::numeric, 1) FROM nursing_tasks t JOIN patients p ON p.id = t.patient_id WHERE p.org_id = me.org_id AND t.completed_at IS NOT NULL AND t.created_at BETWEEN p_from AND p_to),
    'report_trend', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'bucket'), '[]') FROM (
        SELECT jsonb_build_object('bucket', date_trunc(b, r.created_at), 'count', count(*),
               'avg_ack_minutes', round(avg(extract(epoch FROM r.nurse_ack_at - r.created_at)/60)::numeric, 1)) x
        FROM reports r JOIN patients p ON p.id = r.patient_id WHERE p.org_id = me.org_id AND r.created_at BETWEEN p_from AND p_to
        GROUP BY date_trunc(b, r.created_at)) s),
    'task_trend', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'bucket'), '[]') FROM (
        SELECT jsonb_build_object('bucket', date_trunc(b, t.created_at), 'created', count(*),
               'completed', count(*) FILTER (WHERE t.completed_at IS NOT NULL)) x
        FROM nursing_tasks t JOIN patients p ON p.id = t.patient_id WHERE p.org_id = me.org_id AND t.created_at BETWEEN p_from AND p_to
        GROUP BY date_trunc(b, t.created_at)) s),
    'overdue_followups', (SELECT count(*) FROM follow_ups f JOIN patients p ON p.id = f.patient_id WHERE p.org_id = me.org_id AND f.status = 'planned' AND f.target_date < current_date),
    'followups_done', (SELECT count(*) FROM follow_ups f JOIN patients p ON p.id = f.patient_id WHERE p.org_id = me.org_id AND f.completed_at BETWEEN p_from AND p_to)
  );
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['admin_list_staff()','admin_set_permission(text,text,boolean)','admin_set_staff_active(text,boolean)',
    'admin_set_care_team(text,text[])','admin_reassign_task(text,text)','admin_patient_overview()','admin_list_open_tasks()',
    'admin_metrics(timestamptz,timestamptz,text)','has_permission(text,text)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.report_action(p_id text, p_action text, p_target text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_plan text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  u app_users := current_persona();
  r reports; pt patients; t app_users;
  is_open boolean; assigned boolean; nurse_ok boolean;
  note text := nullif(left(trim(coalesce(p_note,'')),1000),'');
  plan text := nullif(left(trim(coalesce(p_plan,'')),1000),'');
begin
  if u.persona_id is null then raise exception 'forbidden'; end if;
  select * into r from reports where id = p_id for update;
  if not found then raise exception 'forbidden'; end if;
  select * into pt from patients where id = r.patient_id;
  if pt.org_id <> u.org_id or not can_view_report(p_id) then raise exception 'forbidden'; end if;
  is_open := r.status <> 'closed';
  assigned := r.assignee_id = u.persona_id;
  nurse_ok := u.role = 'nurse' and u.persona_id = any(pt.care_team);
  if p_target is not null then
    select * into t from app_users where persona_id = p_target and active and org_id = pt.org_id;
  end if;

  if p_action = 'nurseAck' then
    if not (nurse_ok and r.status = 'submitted') then raise exception 'forbidden'; end if;
    update reports set status = 'acknowledged', nurse_ack_by = u.persona_id, nurse_ack_at = now() where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'status', 'acknowledged');
  elsif p_action = 'returnAck' then
    if not (nurse_ok and assigned and r.status = 'returned_to_nursing') then raise exception 'forbidden'; end if;
    update reports set status = 'nursing_follow_up', return_ack_by = u.persona_id, return_ack_at = now() where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'return_ack', 'nursing_follow_up');
  elsif p_action = 'nursingObs' then
    if not (nurse_ok and is_open) or note is null then raise exception 'forbidden'; end if;
    insert into report_activity(report_id, by_user_id, type, note) values (p_id, u.persona_id, 'nursing_obs', note);
  elsif p_action = 'escalate' then
    if not (nurse_ok and r.status in ('acknowledged','awaiting_physician','nursing_follow_up'))
       or t.persona_id is null or t.role <> 'physician' or r.assignee_id = t.persona_id then
      raise exception 'forbidden';
    end if;
    update reports set assignee_id = t.persona_id, status = 'awaiting_physician',
      physician_ack_by = null, physician_ack_at = null where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note, status)
    values (p_id, u.persona_id, 'escalated', t.persona_id, note, 'awaiting_physician');
  elsif p_action = 'physAck' then
    if not (u.role = 'physician' and assigned and r.status = 'awaiting_physician') then raise exception 'forbidden'; end if;
    update reports set status = 'under_review', physician_ack_by = u.persona_id, physician_ack_at = now() where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'status', 'under_review');
  elsif p_action = 'assessment' then
    if not (u.role = 'physician' and assigned and r.status in ('under_review','follow_up')) or note is null or plan is null then raise exception 'forbidden'; end if;
    update reports set status = 'follow_up' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status, note, plan) values (p_id, u.persona_id, 'assessment', 'follow_up', note, plan);
  elsif p_action = 'returnToNursing' then
    if not (u.role = 'physician' and assigned and r.status in ('under_review','follow_up'))
       or note is null or t.persona_id is null or t.role <> 'nurse' or not (t.persona_id = any(pt.care_team)) then
      raise exception 'forbidden';
    end if;
    update reports set assignee_id = t.persona_id, status = 'returned_to_nursing',
      returned_by = u.persona_id, returned_at = now(), return_reason = note,
      return_ack_by = null, return_ack_at = null where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note, status)
    values (p_id, u.persona_id, 'returned', t.persona_id, note, 'returned_to_nursing');
  elsif p_action = 'approveClosure' then
    if not (u.role = 'physician' and u.can_approve_closure and assigned and r.status = 'follow_up') then raise exception 'forbidden'; end if;
    update reports set status = 'closed' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'closure_approved', 'closed');
    insert into admin_audit_log(org_id, actor_id, action, resource_type, resource_id, old_value, new_value)
    values (pt.org_id, u.persona_id, 'closure_approved', 'report', p_id, to_jsonb(r.status), to_jsonb('closed'::text));
  elsif p_action = 'delegatedReassign' then
    if u.role not in ('nurse','physician') or not (assigned and is_open and has_permission(u.persona_id, 'reassign_reports'))
       or t.persona_id is null or t.persona_id = u.persona_id or t.role <> u.role
       or (u.role = 'nurse' and not (nurse_ok and t.persona_id = any(pt.care_team)))
       or (u.role = 'physician' and r.status not in ('awaiting_physician','under_review','follow_up')) then
      raise exception 'forbidden';
    end if;
    if u.role = 'physician' then
      update reports set assignee_id = t.persona_id, status = 'awaiting_physician' where id = p_id;
    else
      update reports set assignee_id = t.persona_id where id = p_id;
    end if;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note) values (p_id, u.persona_id, 'assigned', t.persona_id, note);
    insert into admin_audit_log(org_id, actor_id, action, target_user_id, resource_type, resource_id, old_value, new_value)
    values (pt.org_id, u.persona_id, 'report_reassign', t.persona_id, 'report', p_id, to_jsonb(r.assignee_id), to_jsonb(t.persona_id));
  elsif p_action = 'adminAssign' then
    if not (u.role = 'admin' and is_open) or t.persona_id is null or t.role not in ('nurse','physician')
       or (t.role = 'nurse' and not (t.persona_id = any(pt.care_team))) then raise exception 'forbidden'; end if;
    if t.role = 'physician' then
      update reports set assignee_id = t.persona_id, physician_ack_by = null, physician_ack_at = null,
        status = case when status in ('acknowledged','awaiting_physician','under_review','returned_to_nursing','nursing_follow_up')
                      then 'awaiting_physician' else status end
      where id = p_id;
    else
      update reports set assignee_id = t.persona_id where id = p_id;
    end if;
    insert into report_activity(report_id, by_user_id, type, assignee_id) values (p_id, u.persona_id, 'assigned', t.persona_id);
    insert into admin_audit_log(org_id, actor_id, action, target_user_id, resource_type, resource_id, old_value, new_value)
    values (pt.org_id, u.persona_id, 'report_reassign', t.persona_id, 'report', p_id, to_jsonb(r.assignee_id), to_jsonb(t.persona_id));
  else
    raise exception 'unknown action';
  end if;
end $function$;