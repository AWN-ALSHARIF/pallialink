CREATE TABLE IF NOT EXISTS public.patient_profiles (
  patient_id text PRIMARY KEY REFERENCES public.patients(id),
  mrn text UNIQUE NOT NULL,
  sex text, date_of_birth date, language text,
  primary_diagnosis text, secondary_diagnoses text[] NOT NULL DEFAULT '{}',
  palliative_diagnosis text, care_status text,
  past_medical_history text, surgical_history text, family_history text, social_history text,
  goals_of_care text, patient_preferences text,
  is_synthetic boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES public.app_users(persona_id), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_entries (
  id bigserial PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(id),
  kind text NOT NULL CHECK (kind IN ('allergy','medication','vital','lab','nursing_note','physician_assessment',
                                     'care_plan','encounter','document')),
  status text,
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  note text,
  report_id text REFERENCES public.reports(id),
  supersedes_id bigint REFERENCES public.clinical_entries(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES public.app_users(persona_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_synthetic boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS clinical_entries_patient_kind_time_idx ON public.clinical_entries (patient_id, kind, recorded_at DESC);
CREATE INDEX IF NOT EXISTS clinical_entries_patient_time_idx ON public.clinical_entries (patient_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.record_access_log (
  id bigserial PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(id),
  by_user_id text NOT NULL REFERENCES public.app_users(persona_id),
  action text NOT NULL,
  section text, entry_id bigint,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS record_access_log_patient_idx ON public.record_access_log (patient_id, at DESC);

GRANT SELECT ON public.patient_profiles, public.clinical_entries TO authenticated;
GRANT SELECT ON public.record_access_log TO authenticated;
GRANT ALL ON public.patient_profiles, public.clinical_entries, public.record_access_log TO service_role;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_access_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_clinician() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select coalesce((select role in ('nurse','physician','admin') from public.current_persona()), false) $$;

DROP POLICY IF EXISTS "profile visible with patient access" ON public.patient_profiles;
CREATE POLICY "profile visible with patient access" ON public.patient_profiles FOR SELECT TO authenticated
  USING (public.can_view_patient(patient_id));
DROP POLICY IF EXISTS "entries visible by role" ON public.clinical_entries;
CREATE POLICY "entries visible by role" ON public.clinical_entries FOR SELECT TO authenticated
  USING (public.can_view_patient(patient_id)
         AND (public.is_clinician() OR kind IN ('allergy','medication','care_plan')));
DROP POLICY IF EXISTS "access log visible to org admins" ON public.record_access_log;
CREATE POLICY "access log visible to org admins" ON public.record_access_log FOR SELECT TO authenticated
  USING ((public.current_persona()).role = 'admin' AND public.can_view_patient(patient_id));

CREATE OR REPLACE FUNCTION public.emr_log_access(p_patient text, p_action text, p_section text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare u app_users := current_persona();
begin
  if u.persona_id is null or not can_view_patient(p_patient) or p_action not in ('view_record','view_section','view_document') then
    raise exception 'forbidden';
  end if;
  insert into record_access_log(patient_id, by_user_id, action, section) values (p_patient, u.persona_id, p_action, left(p_section, 50));
end $$;

CREATE OR REPLACE FUNCTION public.emr_add_entry(p_patient text, p_kind text, p_title text, p_detail jsonb DEFAULT '{}',
  p_note text DEFAULT NULL, p_status text DEFAULT NULL, p_recorded_at timestamptz DEFAULT NULL,
  p_report text DEFAULT NULL, p_supersedes bigint DEFAULT NULL)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare u app_users := current_persona(); new_id bigint;
begin
  if u.persona_id is null or u.role not in ('nurse','physician') or not can_view_patient(p_patient) then raise exception 'forbidden'; end if;
  if u.role = 'nurse' and p_kind not in ('vital','nursing_note','encounter','allergy','document') then raise exception 'forbidden'; end if;
  if u.role = 'physician' and p_kind not in ('vital','nursing_note','encounter','allergy','document',
                                              'physician_assessment','care_plan','medication','lab') then raise exception 'forbidden'; end if;
  if u.role = 'physician' and p_kind = 'nursing_note' then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null or length(p_title) > 200 or length(coalesce(p_note,'')) > 4000
     or pg_column_size(coalesce(p_detail,'{}'::jsonb)) > 8000 then raise exception 'invalid'; end if;
  if p_report is not null and not exists (select 1 from reports where id = p_report and patient_id = p_patient) then raise exception 'invalid'; end if;
  if p_supersedes is not null and not exists (select 1 from clinical_entries where id = p_supersedes and patient_id = p_patient and kind = p_kind) then raise exception 'invalid'; end if;
  if p_recorded_at is not null and p_recorded_at > now() + interval '5 minutes' then raise exception 'invalid'; end if;
  insert into clinical_entries(patient_id, kind, status, title, detail, note, report_id, supersedes_id, recorded_at, created_by, is_synthetic)
  values (p_patient, p_kind, left(p_status,30), trim(p_title), coalesce(p_detail,'{}'), p_note, p_report, p_supersedes,
          coalesce(p_recorded_at, now()), u.persona_id, true)
  returning id into new_id;
  insert into record_access_log(patient_id, by_user_id, action, section, entry_id) values (p_patient, u.persona_id, 'add_entry', p_kind, new_id);
  return new_id;
end $$;

CREATE OR REPLACE FUNCTION public.emr_update_profile(p_patient text, p_fields jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare u app_users := current_persona(); k text;
begin
  if u.persona_id is null or u.role <> 'physician' or not can_view_patient(p_patient) then raise exception 'forbidden'; end if;
  for k in select jsonb_object_keys(p_fields) loop
    if k not in ('sex','date_of_birth','language','primary_diagnosis','secondary_diagnoses','palliative_diagnosis','care_status',
                 'past_medical_history','surgical_history','family_history','social_history','goals_of_care','patient_preferences')
       or length(p_fields->>k) > 4000 then raise exception 'invalid'; end if;
  end loop;
  insert into patient_profiles(patient_id, mrn) values (p_patient, 'MRN-' || p_patient) on conflict (patient_id) do nothing;
  update patient_profiles set
    sex = case when p_fields ? 'sex' then p_fields->>'sex' else sex end,
    date_of_birth = case when p_fields ? 'date_of_birth' then (p_fields->>'date_of_birth')::date else date_of_birth end,
    language = case when p_fields ? 'language' then p_fields->>'language' else language end,
    primary_diagnosis = case when p_fields ? 'primary_diagnosis' then p_fields->>'primary_diagnosis' else primary_diagnosis end,
    secondary_diagnoses = case when p_fields ? 'secondary_diagnoses' then array(select jsonb_array_elements_text(p_fields->'secondary_diagnoses')) else secondary_diagnoses end,
    palliative_diagnosis = case when p_fields ? 'palliative_diagnosis' then p_fields->>'palliative_diagnosis' else palliative_diagnosis end,
    care_status = case when p_fields ? 'care_status' then p_fields->>'care_status' else care_status end,
    past_medical_history = case when p_fields ? 'past_medical_history' then p_fields->>'past_medical_history' else past_medical_history end,
    surgical_history = case when p_fields ? 'surgical_history' then p_fields->>'surgical_history' else surgical_history end,
    family_history = case when p_fields ? 'family_history' then p_fields->>'family_history' else family_history end,
    social_history = case when p_fields ? 'social_history' then p_fields->>'social_history' else social_history end,
    goals_of_care = case when p_fields ? 'goals_of_care' then p_fields->>'goals_of_care' else goals_of_care end,
    patient_preferences = case when p_fields ? 'patient_preferences' then p_fields->>'patient_preferences' else patient_preferences end,
    updated_by = u.persona_id, updated_at = now()
  where patient_id = p_patient;
  insert into record_access_log(patient_id, by_user_id, action, section) values (p_patient, u.persona_id, 'add_entry', 'profile');
  insert into clinical_entries(patient_id, kind, title, detail, created_by)
  values (p_patient, 'encounter', 'profile_update', jsonb_build_object('changed', p_fields), u.persona_id);
end $$;

REVOKE ALL ON FUNCTION public.is_clinician(), public.emr_log_access(text,text,text),
  public.emr_add_entry(text,text,text,jsonb,text,text,timestamptz,text,bigint), public.emr_update_profile(text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinician(), public.emr_log_access(text,text,text),
  public.emr_add_entry(text,text,text,jsonb,text,text,timestamptz,text,bigint), public.emr_update_profile(text,jsonb)
  TO authenticated;

DROP POLICY IF EXISTS "clinical docs read" ON storage.objects;
CREATE POLICY "clinical docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinical-documents' AND public.is_clinician()
         AND public.can_view_patient(split_part(name, '/', 1)));
DROP POLICY IF EXISTS "clinical docs upload" ON storage.objects;
CREATE POLICY "clinical docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinical-documents'
              AND (public.current_persona()).role IN ('nurse','physician')
              AND public.can_view_patient(split_part(name, '/', 1)));