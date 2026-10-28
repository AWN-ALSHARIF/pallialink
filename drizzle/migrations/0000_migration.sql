
create table public.patients (
  id text primary key, name_ar text not null, name_en text not null, age int not null,
  condition_ar text not null, condition_en text not null, care_team text[] not null default '{}'
);
create table public.app_users (
  persona_id text primary key,
  auth_id uuid unique references auth.users(id) on delete set null,
  role text not null check (role in ('patient','caregiver','nurse','physician','admin')),
  patient_id text references public.patients(id),
  can_approve_closure boolean not null default false,
  name_ar text not null, name_en text not null
);
create table public.reports (
  id text primary key,
  patient_id text not null references public.patients(id),
  submitted_by text not null references public.app_users(persona_id),
  created_at timestamptz not null default now(),
  pain int not null check (pain between 0 and 10),
  symptoms text[] not null default '{}',
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','acknowledged','under_review','follow_up','closed')),
  assignee_id text references public.app_users(persona_id)
);
create table public.report_activity (
  id bigserial primary key,
  report_id text not null references public.reports(id) on delete cascade,
  at timestamptz not null default now(),
  by_user_id text not null references public.app_users(persona_id),
  type text not null,
  status text, assignee_id text, note text, plan text
);
create index on public.report_activity(report_id);
create sequence public.report_seq start 1008;

-- Read-only access for signed-in users; ALL writes go through the checked functions below.
grant select on public.patients, public.app_users, public.reports, public.report_activity to authenticated;
grant all on public.patients, public.app_users, public.reports, public.report_activity to service_role;
grant usage on sequence public.report_seq, public.report_activity_id_seq to service_role;

alter table public.patients enable row level security;
alter table public.app_users enable row level security;
alter table public.reports enable row level security;
alter table public.report_activity enable row level security;

create or replace function public.current_persona() returns public.app_users
language sql stable security definer set search_path = public as $$
  select * from public.app_users where auth_id = auth.uid() limit 1
$$;

create or replace function public.can_view_patient(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case u.role
      when 'admin' then true
      when 'patient' then u.patient_id = p
      when 'caregiver' then u.patient_id = p
      when 'physician' then exists (select 1 from public.reports r where r.patient_id = p and r.assignee_id = u.persona_id)
      else exists (select 1 from public.patients pt where pt.id = p and u.persona_id = any(pt.care_team))
    end
    from public.app_users u where u.auth_id = auth.uid()
  ), false)
$$;

create policy "directory readable by signed-in users" on public.app_users for select to authenticated using (true);
create policy "patients visible by role" on public.patients for select to authenticated using (public.can_view_patient(id));
create policy "reports visible by role" on public.reports for select to authenticated using (public.can_view_patient(patient_id));
create policy "activity visible with report" on public.report_activity for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and public.can_view_patient(r.patient_id)));

create or replace function public._mk(n int, p text, by_u text, h numeric, pain int, sy text[], notes text, st text, assignee text)
returns void language plpgsql security definer set search_path = public as $$
declare
  sts text[] := array['submitted','acknowledged','under_review','follow_up','closed'];
  ord int := array_position(sts, st);
  rid text := 'PL-' || lpad(n::text, 5, '0');
  i int;
begin
  insert into reports(id, patient_id, submitted_by, created_at, pain, symptoms, notes, status, assignee_id)
  values (rid, p, by_u, now() - make_interval(secs => h*3600), pain, sy, notes, st, assignee);
  insert into report_activity(report_id, at, by_user_id, type) values (rid, now() - make_interval(secs => h*3600), by_u, 'created');
  if assignee is not null then
    insert into report_activity(report_id, at, by_user_id, type, assignee_id) values (rid, now() - make_interval(secs => (h-0.3)*3600), 'u-admin', 'assigned', assignee);
  end if;
  for i in 2..ord loop
    insert into report_activity(report_id, at, by_user_id, type, status)
    values (rid, now() - make_interval(secs => (h-0.5-(i-2))*3600), coalesce(assignee,'u-nurse'), 'status', sts[i]);
  end loop;
end $$;

create or replace function public.seed_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from report_activity; delete from reports;
  perform setval('report_seq', 1007);
  perform _mk(1001,'p1','u-pat',72,4,array['fatigue'],'تعب بعد الظهر','closed','u-nurse');
  perform _mk(1002,'p2','u-cg',50,6,array['nausea','sleep'],'صعوبة في النوم ليلة أمس','follow_up','u-doc');
  perform _mk(1003,'p3','u-doc2',30,3,array['breathlessness'],'','under_review','u-doc2');
  perform _mk(1004,'p1','u-pat',20,7,array['nausea','fatigue'],'ألم متزايد في الظهر','acknowledged','u-nurse');
  perform _mk(1005,'p2','u-cg',6,5,array['breathlessness'],'','submitted',null);
  perform _mk(1006,'p3','u-doc2',2,2,array['sleep'],'','submitted',null);
end $$;

insert into public.patients values
 ('p1','سارة العتيبي','Sarah Al-Otaibi',64,'رعاية تلطيفية منزلية','Home palliative care',array['u-nurse','u-doc']),
 ('p2','عبدالله الحربي','Abdullah Al-Harbi',78,'رعاية تلطيفية منزلية','Home palliative care',array['u-nurse','u-doc']),
 ('p3','منيرة الشهري','Munira Al-Shehri',71,'رعاية تلطيفية منزلية','Home palliative care',array['u-nurse','u-doc2']);
insert into public.app_users(persona_id, role, patient_id, can_approve_closure, name_ar, name_en) values
 ('u-pat','patient','p1',false,'سارة العتيبي','Sarah Al-Otaibi'),
 ('u-cg','caregiver','p2',false,'خالد الحربي','Khalid Al-Harbi'),
 ('u-nurse','nurse',null,false,'الممرضة نورة القحطاني','Nurse Noura Al-Qahtani'),
 ('u-doc','physician',null,true,'د. فهد الزهراني','Dr. Fahad Al-Zahrani'),
 ('u-doc2','physician',null,false,'د. لمى الغامدي','Dr. Lama Al-Ghamdi'),
 ('u-admin','admin',null,false,'ريم الدوسري','Reem Al-Dosari');
select public.seed_demo();

create or replace function public.submit_report(p_pain int, p_symptoms text[], p_notes text) returns text
language plpgsql security definer set search_path = public as $$
declare u app_users := current_persona(); rid text; now_ts timestamptz := now();
begin
  if u.persona_id is null or u.role not in ('patient','caregiver') or u.patient_id is null then raise exception 'forbidden'; end if;
  if p_pain is null or p_pain < 0 or p_pain > 10 then raise exception 'invalid pain'; end if;
  if not (coalesce(p_symptoms,'{}') <@ array['nausea','fatigue','breathlessness','sleep','other']) then raise exception 'invalid symptoms'; end if;
  rid := 'PL-' || lpad(nextval('report_seq')::text, 5, '0');
  insert into reports(id, patient_id, submitted_by, created_at, pain, symptoms, notes)
  values (rid, u.patient_id, u.persona_id, now_ts, p_pain, coalesce(p_symptoms,'{}'), left(coalesce(p_notes,''),1000));
  insert into report_activity(report_id, at, by_user_id, type) values (rid, now_ts, u.persona_id, 'created');
  return rid;
end $$;

create or replace function public.report_action(p_id text, p_action text, p_target text default null, p_note text default null, p_plan text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  u app_users := current_persona();
  r reports;
  is_open boolean;
  note text := nullif(left(trim(coalesce(p_note,'')),1000),'');
  plan text := nullif(left(trim(coalesce(p_plan,'')),1000),'');
  assigned boolean;
begin
  if u.persona_id is null then raise exception 'forbidden'; end if;
  select * into r from reports where id = p_id for update;
  if not found or not can_view_patient(r.patient_id) then raise exception 'forbidden'; end if;
  is_open := r.status <> 'closed';
  assigned := r.assignee_id = u.persona_id;
  if p_action = 'nurseAck' then
    if not (u.role = 'nurse' and r.status = 'submitted') then raise exception 'forbidden'; end if;
    update reports set status = 'acknowledged' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'status', 'acknowledged');
  elsif p_action = 'nursingObs' then
    if not (u.role = 'nurse' and is_open) or note is null then raise exception 'forbidden'; end if;
    insert into report_activity(report_id, by_user_id, type, note) values (p_id, u.persona_id, 'nursing_obs', note);
  elsif p_action = 'escalate' then
    if not (u.role = 'nurse' and is_open) or not exists (select 1 from app_users where persona_id = p_target and role = 'physician') then raise exception 'forbidden'; end if;
    update reports set assignee_id = p_target, status = case when status = 'submitted' then 'acknowledged' else status end where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note) values (p_id, u.persona_id, 'escalated', p_target, note);
  elsif p_action = 'physAck' then
    if not (u.role = 'physician' and assigned and r.status in ('submitted','acknowledged')) then raise exception 'forbidden'; end if;
    update reports set status = 'under_review' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'status', 'under_review');
  elsif p_action = 'assessment' then
    if not (u.role = 'physician' and assigned and is_open) or note is null or plan is null then raise exception 'forbidden'; end if;
    update reports set status = 'follow_up' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status, note, plan) values (p_id, u.persona_id, 'assessment', 'follow_up', note, plan);
  elsif p_action = 'returnToNursing' then
    if not (u.role = 'physician' and assigned and is_open) or not exists (select 1 from app_users where persona_id = p_target and role = 'nurse') then raise exception 'forbidden'; end if;
    update reports set assignee_id = p_target, status = 'acknowledged' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id, note) values (p_id, u.persona_id, 'returned', p_target, note);
  elsif p_action = 'approveClosure' then
    if not (u.role = 'physician' and u.can_approve_closure and assigned and r.status = 'follow_up') then raise exception 'forbidden'; end if;
    update reports set status = 'closed' where id = p_id;
    insert into report_activity(report_id, by_user_id, type, status) values (p_id, u.persona_id, 'closure_approved', 'closed');
  elsif p_action = 'adminAssign' then
    if not (u.role = 'admin' and is_open) or not exists (select 1 from app_users where persona_id = p_target and role in ('nurse','physician')) then raise exception 'forbidden'; end if;
    update reports set assignee_id = p_target where id = p_id;
    insert into report_activity(report_id, by_user_id, type, assignee_id) values (p_id, u.persona_id, 'assigned', p_target);
  else
    raise exception 'unknown action';
  end if;
end $$;

create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if (current_persona()).persona_id is null then raise exception 'forbidden'; end if;
  perform seed_demo();
end $$;

revoke execute on function public._mk(int,text,text,numeric,int,text[],text,text,text), public.seed_demo() from public, anon, authenticated;
revoke execute on function public.current_persona(), public.can_view_patient(text), public.submit_report(int,text[],text),
  public.report_action(text,text,text,text,text), public.reset_demo() from public, anon;
grant execute on function public.current_persona(), public.can_view_patient(text), public.submit_report(int,text[],text),
  public.report_action(text,text,text,text,text), public.reset_demo() to authenticated;
