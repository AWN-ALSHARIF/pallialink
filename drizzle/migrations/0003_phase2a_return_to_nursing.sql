INSERT INTO public._mig_p1_function_backup(fn_name, definition)
SELECT 'p2a:' || p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('report_action','can_view_report')
ON CONFLICT (fn_name) DO NOTHING;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK (status = ANY (ARRAY[
  'submitted','acknowledged','awaiting_physician','under_review','follow_up',
  'returned_to_nursing','nursing_follow_up','closed']));

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS returned_by        text REFERENCES public.app_users(persona_id),
  ADD COLUMN IF NOT EXISTS returned_at        timestamptz,
  ADD COLUMN IF NOT EXISTS return_reason      text,
  ADD COLUMN IF NOT EXISTS return_ack_by      text REFERENCES public.app_users(persona_id),
  ADD COLUMN IF NOT EXISTS return_ack_at      timestamptz;

CREATE OR REPLACE FUNCTION public.can_view_report(p_report text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select coalesce((
    select case u.role
      when 'admin' then pt.org_id = u.org_id
      when 'patient' then u.patient_id = r.patient_id
      when 'caregiver' then u.patient_id = r.patient_id
      when 'nurse' then pt.org_id = u.org_id and u.persona_id = any(pt.care_team)
      when 'physician' then pt.org_id = u.org_id and (r.assignee_id = u.persona_id or r.physician_ack_by = u.persona_id
        or exists (select 1 from public.report_activity a where a.report_id = r.id and a.by_user_id = u.persona_id
                   and a.type in ('status','assessment','returned')))
      else false end
    from public.reports r join public.patients pt on pt.id = r.patient_id
    join public.app_users u on u.auth_id = (select auth.uid()) and u.active
    where r.id = p_report
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.list_assignable_nurses(p_report text)
 RETURNS TABLE(persona_id text, name_ar text, name_en text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select d.persona_id, d.name_ar, d.name_en
  from public.app_users me
  join public.reports r on r.id = p_report and r.assignee_id = me.persona_id
  join public.patients pt on pt.id = r.patient_id and pt.org_id = me.org_id
  join public.app_users d on d.org_id = pt.org_id and d.role = 'nurse' and d.active and d.persona_id = any(pt.care_team)
  where me.auth_id = auth.uid() and me.active and me.role = 'physician'
  order by d.persona_id
$$;

CREATE OR REPLACE FUNCTION public.report_action(p_id text, p_action text, p_target text DEFAULT NULL, p_note text DEFAULT NULL, p_plan text DEFAULT NULL)
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

  elsif p_action = 'adminAssign' then
    if not (u.role = 'admin' and is_open) or t.persona_id is null or t.role not in ('nurse','physician') then raise exception 'forbidden'; end if;
    if t.role = 'physician' then
      update reports set assignee_id = t.persona_id, physician_ack_by = null, physician_ack_at = null,
        status = case when status in ('acknowledged','awaiting_physician','under_review','returned_to_nursing','nursing_follow_up')
                      then 'awaiting_physician' else status end
      where id = p_id;
    else
      update reports set assignee_id = t.persona_id where id = p_id;
    end if;
    insert into report_activity(report_id, by_user_id, type, assignee_id) values (p_id, u.persona_id, 'assigned', t.persona_id);
  else
    raise exception 'unknown action';
  end if;
end $function$;

REVOKE ALL ON FUNCTION public.list_assignable_nurses(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_nurses(text) TO authenticated;