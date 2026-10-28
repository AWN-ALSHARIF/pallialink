CREATE TABLE IF NOT EXISTS public._mig_p1_report_backup (
  report_id text PRIMARY KEY, old_status text NOT NULL, old_assignee_id text, saved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public._mig_p1_function_backup (
  fn_name text PRIMARY KEY, definition text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public._mig_p1_report_backup, public._mig_p1_function_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._mig_p1_report_backup, public._mig_p1_function_backup TO service_role;
ALTER TABLE public._mig_p1_report_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._mig_p1_function_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO public._mig_p1_report_backup(report_id, old_status, old_assignee_id)
SELECT id, status, assignee_id FROM public.reports ON CONFLICT (report_id) DO NOTHING;

INSERT INTO public._mig_p1_function_backup(fn_name, definition)
SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('report_action','can_view_patient','current_persona','reset_demo','submit_report')
ON CONFLICT (fn_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.organizations (
  id text PRIMARY KEY, name_ar text NOT NULL, name_en text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
INSERT INTO public.organizations(id, name_ar, name_en, is_demo)
VALUES ('org-demo', 'منظمة تجريبية (بيانات اصطناعية)', 'Demo organization (synthetic data)', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'org-demo' REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'org-demo' REFERENCES public.organizations(id);

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status = ANY (ARRAY['submitted','acknowledged','awaiting_physician','under_review','follow_up','closed']));
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS nurse_ack_by     text REFERENCES public.app_users(persona_id),
  ADD COLUMN IF NOT EXISTS nurse_ack_at     timestamptz,
  ADD COLUMN IF NOT EXISTS physician_ack_by text REFERENCES public.app_users(persona_id),
  ADD COLUMN IF NOT EXISTS physician_ack_at timestamptz;

UPDATE public.reports r SET nurse_ack_by = a.by_user_id, nurse_ack_at = a.at
FROM (SELECT DISTINCT ON (a.report_id) a.report_id, a.by_user_id, a.at
      FROM public.report_activity a JOIN public.app_users u ON u.persona_id = a.by_user_id
      WHERE a.type = 'status' AND a.status = 'acknowledged' AND u.role = 'nurse'
      ORDER BY a.report_id, a.id) a
WHERE a.report_id = r.id AND r.nurse_ack_by IS NULL;

UPDATE public.reports r SET physician_ack_by = a.by_user_id, physician_ack_at = a.at
FROM (SELECT DISTINCT ON (a.report_id) a.report_id, a.by_user_id, a.at
      FROM public.report_activity a
      JOIN public.app_users u ON u.persona_id = a.by_user_id AND u.role = 'physician'
      JOIN public.reports rr ON rr.id = a.report_id AND rr.assignee_id = a.by_user_id
      WHERE a.type = 'status' AND a.status = 'under_review'
        AND a.at >= coalesce((SELECT max(x.at) FROM public.report_activity x
                              WHERE x.report_id = a.report_id AND x.type IN ('escalated','assigned')
                                AND x.assignee_id = a.by_user_id), '-infinity')
      ORDER BY a.report_id, a.id DESC) a
WHERE a.report_id = r.id AND r.physician_ack_by IS NULL;

WITH moved AS (
  UPDATE public.reports r SET status = 'awaiting_physician'
  FROM public.app_users u
  WHERE u.persona_id = r.assignee_id AND u.role = 'physician'
    AND r.status IN ('submitted','acknowledged') AND r.physician_ack_by IS NULL
  RETURNING r.id, r.assignee_id
)
INSERT INTO public.report_activity(report_id, by_user_id, type, status, note)
SELECT id, assignee_id, 'status', 'awaiting_physician', 'system migration: awaiting physician acknowledgment' FROM moved;

CREATE INDEX IF NOT EXISTS reports_patient_created_idx ON public.reports (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_assignee_idx ON public.reports (assignee_id);
CREATE INDEX IF NOT EXISTS report_activity_report_id_id_idx ON public.report_activity (report_id, id);
CREATE INDEX IF NOT EXISTS patients_care_team_gin ON public.patients USING gin (care_team);

CREATE OR REPLACE FUNCTION public.current_persona() RETURNS public.app_users
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select * from public.app_users where auth_id = auth.uid() and active limit 1 $$;

CREATE OR REPLACE FUNCTION public.can_view_patient(p text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select coalesce((
    select case u.role
      when 'admin' then pt.org_id = u.org_id
      when 'patient' then u.patient_id = p
      when 'caregiver' then u.patient_id = p
      when 'nurse' then pt.org_id = u.org_id and u.persona_id = any(pt.care_team)
      when 'physician' then pt.org_id = u.org_id and (u.persona_id = any(pt.care_team)
        or exists (select 1 from public.reports r where r.patient_id = p and r.assignee_id = u.persona_id and r.status <> 'closed'))
      else false end
    from public.app_users u join public.patients pt on pt.id = p
    where u.auth_id = (select auth.uid()) and u.active
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_view_report(p_report text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select coalesce((
    select case u.role
      when 'admin' then pt.org_id = u.org_id
      when 'patient' then u.patient_id = r.patient_id
      when 'caregiver' then u.patient_id = r.patient_id
      when 'nurse' then pt.org_id = u.org_id and u.persona_id = any(pt.care_team)
      when 'physician' then pt.org_id = u.org_id and (r.assignee_id = u.persona_id or r.physician_ack_by = u.persona_id)
      else false end
    from public.reports r join public.patients pt on pt.id = r.patient_id
    join public.app_users u on u.auth_id = (select auth.uid()) and u.active
    where r.id = p_report
  ), false)
$$;

DROP POLICY IF EXISTS "reports visible by role" ON public.reports;
CREATE POLICY "reports visible by report access" ON public.reports FOR SELECT TO authenticated
  USING (public.can_view_report(id));
DROP POLICY IF EXISTS "activity visible with report" ON public.report_activity;
CREATE POLICY "activity visible by report access" ON public.report_activity FOR SELECT TO authenticated
  USING (public.can_view_report(report_id));
DROP POLICY IF EXISTS "orgs visible to members" ON public.organizations;
CREATE POLICY "orgs visible to members" ON public.organizations FOR SELECT TO authenticated
  USING (id = (public.current_persona()).org_id);

CREATE OR REPLACE FUNCTION public.list_assignable_physicians(p_report text)
 RETURNS TABLE(persona_id text, name_ar text, name_en text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select d.persona_id, d.name_ar, d.name_en
  from public.app_users me
  join public.reports r on r.id = p_report
  join public.patients pt on pt.id = r.patient_id
  join public.app_users d on d.org_id = pt.org_id and d.role = 'physician' and d.active
  where me.auth_id = auth.uid() and me.active and me.org_id = pt.org_id
    and ((me.role = 'nurse' and me.persona_id = any(pt.care_team)) or me.role = 'admin')
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

  elsif p_action = 'nursingObs' then
    if not (nurse_ok and is_open) or note is null then raise exception 'forbidden'; end if;
    insert into report_activity(report_id, by_user_id, type, note) values (p_id, u.persona_id, 'nursing_obs', note);

  elsif p_action = 'escalate' then
    if not (nurse_ok and r.status in ('acknowledged','awaiting_physician'))
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
    if not (u.role = 'physician' and assigned and is_open) or t.persona_id is null or t.role <> 'nurse'
       or not (t.persona_id = any(pt.care_team)) then raise exception 'forbidden'; end if;
    update reports set assignee_id = t.persona_id,
      status = case when status in ('awaiting_physician','under_review') then 'acknowledged' else status end where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note) values (p_id, u.persona_id, 'returned', t.persona_id, note);

  elsif p_action = 'approveClosure' then
    if not (u.role = 'physician' and u.can_approve_closure and assigned and r.status = 'follow_up') then raise exception 'forbidden'; end if;
    update reports set status = 'closed' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'closure_approved', 'closed');

  elsif p_action = 'adminAssign' then
    if not (u.role = 'admin' and is_open) or t.persona_id is null or t.role not in ('nurse','physician') then raise exception 'forbidden'; end if;
    if t.role = 'physician' then
      update reports set assignee_id = t.persona_id, physician_ack_by = null, physician_ack_at = null,
        status = case when status in ('acknowledged','awaiting_physician','under_review') then 'awaiting_physician' else status end
      where id = p_id;
    else
      update reports set assignee_id = t.persona_id where id = p_id;
    end if;
    insert into report_activity(report_id, by_user_id, type, assignee_id) values (p_id, u.persona_id, 'assigned', t.persona_id);
  else
    raise exception 'unknown action';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.reset_demo() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare u app_users := current_persona();
begin
  if u.role is distinct from 'admin'
     or not exists (select 1 from organizations o where o.id = u.org_id and o.is_demo) then
    raise exception 'forbidden';
  end if;
  perform seed_demo();
end $$;

REVOKE ALL ON FUNCTION public.report_action(text,text,text,text,text), public.submit_report(integer,text[],text),
  public.current_persona(), public.can_view_patient(text), public.can_view_report(text),
  public.list_assignable_physicians(text), public.reset_demo(), public.seed_demo(),
  public._mk(integer,text,text,numeric,integer,text[],text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_action(text,text,text,text,text), public.submit_report(integer,text[],text),
  public.current_persona(), public.can_view_patient(text), public.can_view_report(text),
  public.list_assignable_physicians(text), public.reset_demo() TO authenticated;