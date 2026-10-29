-- PalliaLink Access+ Phase 1 — PROPOSAL ONLY. Do not execute without explicit approval.
-- No patient/account/clinical/report/task updates. No demo configuration or permission grants.
-- Apply atomically through the approved migration mechanism. Existing public functions retained.
-- Existing permission constraint is broadened; admin_set_permission is replaced, retaining old branches.

CREATE TABLE public.patient_accessibility_profiles (
  patient_id text PRIMARY KEY REFERENCES public.patients(id),
  needs text[] NOT NULL DEFAULT '{}',
  other_need text,
  communication_methods text[] NOT NULL DEFAULT '{}',
  primary_method text,
  staff_interface_preferences jsonb NOT NULL DEFAULT '{}',
  support_notes text,
  review_status text NOT NULL DEFAULT 'not_reviewed',
  next_review_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL REFERENCES public.app_users(persona_id),
  revision bigint NOT NULL DEFAULT 1,
  CONSTRAINT accessibility_needs_values CHECK (needs <@ ARRAY['speech_communication','visual','hearing','motor','cognitive','digital_assistance','other']::text[] AND array_position(needs,NULL) IS NULL),
  CONSTRAINT accessibility_methods_values CHECK (communication_methods <@ ARRAY['text','pictures','phrases','voice','tts','screen_reader','caregiver_assisted','other']::text[] AND array_position(communication_methods,NULL) IS NULL),
  CONSTRAINT accessibility_primary_selected CHECK (primary_method IS NULL OR primary_method = ANY(communication_methods)),
  CONSTRAINT accessibility_review_values CHECK (review_status IN ('not_reviewed','reviewed','review_requested')),
  CONSTRAINT accessibility_lengths CHECK (length(coalesce(other_need,'')) <= 500 AND length(coalesce(support_notes,'')) <= 2000),
  CONSTRAINT accessibility_other_selected CHECK (other_need IS NULL OR 'other' = ANY(needs)),
  CONSTRAINT accessibility_revision_positive CHECK (revision > 0)
);
GRANT SELECT ON public.patient_accessibility_profiles TO authenticated;
GRANT ALL ON public.patient_accessibility_profiles TO service_role;
ALTER TABLE public.patient_accessibility_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.patient_interface_preferences (
  patient_id text PRIMARY KEY REFERENCES public.patients(id),
  preferences jsonb NOT NULL DEFAULT '{}',
  communication_methods text[] NOT NULL DEFAULT '{}',
  primary_method text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL REFERENCES public.app_users(persona_id),
  revision bigint NOT NULL DEFAULT 1,
  CONSTRAINT personal_methods_values CHECK (communication_methods <@ ARRAY['text','pictures','phrases','voice','tts','screen_reader','caregiver_assisted','other']::text[] AND array_position(communication_methods,NULL) IS NULL),
  CONSTRAINT personal_primary_selected CHECK (primary_method IS NULL OR primary_method = ANY(communication_methods)),
  CONSTRAINT personal_revision_positive CHECK (revision > 0)
);
GRANT SELECT ON public.patient_interface_preferences TO authenticated;
GRANT ALL ON public.patient_interface_preferences TO service_role;
ALTER TABLE public.patient_interface_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.patient_accessibility_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(id),
  actor_id text NOT NULL REFERENCES public.app_users(persona_id),
  source text NOT NULL CHECK (source IN ('staff_profile','patient_preferences')),
  old_value jsonb,
  new_value jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.patient_accessibility_history TO authenticated;
GRANT ALL ON public.patient_accessibility_history TO service_role;
ALTER TABLE public.patient_accessibility_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX accessibility_history_patient_at ON public.patient_accessibility_history(patient_id, at DESC, id DESC);

-- Existing checked RPCs remain the only write path; no authenticated direct write grants/policies.
-- No new role table or privilege source: extend the existing protected staff_permissions system.
ALTER TABLE public.staff_permissions DROP CONSTRAINT staff_permissions_permission_check;
ALTER TABLE public.staff_permissions ADD CONSTRAINT staff_permissions_permission_check
  CHECK (permission IN ('reassign_reports','manage_patient_accessibility'));

CREATE FUNCTION public.accessibility_staff_scope(p_patient text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT pt.org_id = me.org_id
    AND (me.role = 'admin' OR (me.role IN ('nurse','physician') AND me.persona_id = ANY(pt.care_team)))
    FROM public.patients pt CROSS JOIN public.current_persona() me
    WHERE pt.id = p_patient AND me.persona_id IS NOT NULL AND me.active), false)
$$;
REVOKE ALL ON FUNCTION public.accessibility_staff_scope(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accessibility_staff_scope(text) TO authenticated, service_role;

CREATE FUNCTION public.accessibility_patient_scope(p_patient text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT me.role = 'patient' AND me.patient_id = pt.id AND me.org_id = pt.org_id
    FROM public.patients pt CROSS JOIN public.current_persona() me
    WHERE pt.id = p_patient AND me.persona_id IS NOT NULL AND me.active), false)
$$;
REVOKE ALL ON FUNCTION public.accessibility_patient_scope(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accessibility_patient_scope(text) TO authenticated, service_role;

CREATE FUNCTION public.can_manage_patient_accessibility(p_patient text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((SELECT me.role IN ('nurse','physician')
    AND public.accessibility_staff_scope(p_patient)
    AND public.has_permission(me.persona_id,'manage_patient_accessibility')
    FROM public.current_persona() me WHERE me.persona_id IS NOT NULL AND me.active), false)
$$;
REVOKE ALL ON FUNCTION public.can_manage_patient_accessibility(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_patient_accessibility(text) TO authenticated, service_role;

CREATE POLICY accessibility_staff_read ON public.patient_accessibility_profiles
  FOR SELECT TO authenticated USING (public.accessibility_staff_scope(patient_id));
CREATE POLICY personal_preferences_read ON public.patient_interface_preferences
  FOR SELECT TO authenticated USING (public.accessibility_patient_scope(patient_id) OR public.accessibility_staff_scope(patient_id));
CREATE POLICY accessibility_history_staff_read ON public.patient_accessibility_history
  FOR SELECT TO authenticated USING (public.accessibility_staff_scope(patient_id));

-- An immutable structured-value validator; explicit booleans, no arbitrary JSON nesting/keys.
CREATE FUNCTION public.accessibility_valid_interface(p_value jsonb, p_patient_controlled boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE k text; v jsonb;
BEGIN
  IF p_value IS NULL OR p_patient_controlled IS NULL OR jsonb_typeof(p_value) <> 'object' THEN RETURN false; END IF;
  FOR k,v IN SELECT * FROM jsonb_each(p_value) LOOP
    IF k = 'text_size' THEN
      IF jsonb_typeof(v) <> 'string' OR v #>> '{}' NOT IN ('standard','large','extra_large') THEN RETURN false; END IF;
    ELSIF k = 'contrast' THEN
      IF jsonb_typeof(v) <> 'string' OR v #>> '{}' NOT IN ('standard','high') THEN RETURN false; END IF;
    ELSIF k IN ('larger_controls','reduced_motion','simplified_navigation','step_by_step','visual_notifications','screen_reader_friendly') THEN
      IF jsonb_typeof(v) <> 'boolean' THEN RETURN false; END IF;
      IF p_patient_controlled AND k NOT IN ('reduced_motion','simplified_navigation') THEN RETURN false; END IF;
    ELSE RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.accessibility_valid_interface(jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accessibility_valid_interface(jsonb,boolean) TO authenticated, service_role;
ALTER TABLE public.patient_accessibility_profiles ADD CONSTRAINT staff_interface_values
  CHECK (public.accessibility_valid_interface(staff_interface_preferences,false));
ALTER TABLE public.patient_interface_preferences ADD CONSTRAINT patient_interface_values
  CHECK (public.accessibility_valid_interface(preferences,true));

CREATE OR REPLACE FUNCTION public.admin_set_permission(p_persona text,p_permission text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me public.app_users := public._require_admin(); s public.app_users; was boolean;
BEGIN
  IF p_enabled IS NULL OR p_permission IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT * INTO s FROM public.app_users WHERE persona_id = p_persona FOR UPDATE;
  IF s.persona_id IS NULL OR s.org_id <> me.org_id OR s.persona_id = me.persona_id
     OR s.role NOT IN ('nurse','physician') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_permission = 'approve_closure' THEN
    IF s.role <> 'physician' THEN RAISE EXCEPTION 'forbidden'; END IF;
    was := s.can_approve_closure;
    UPDATE public.app_users SET can_approve_closure = p_enabled WHERE persona_id = p_persona;
  ELSIF p_permission IN ('reassign_reports','manage_patient_accessibility') THEN
    was := EXISTS (SELECT 1 FROM public.staff_permissions WHERE persona_id = p_persona AND permission = p_permission);
    IF p_enabled THEN
      INSERT INTO public.staff_permissions(persona_id,permission,granted_by)
      VALUES (p_persona,p_permission,me.persona_id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.staff_permissions WHERE persona_id = p_persona AND permission = p_permission;
    END IF;
  ELSE RAISE EXCEPTION 'invalid'; END IF;
  IF was IS DISTINCT FROM p_enabled THEN
    INSERT INTO public.admin_audit_log(org_id,actor_id,action,target_user_id,resource_type,resource_id,old_value,new_value)
    VALUES (me.org_id,me.persona_id,CASE WHEN p_enabled THEN 'permission_grant' ELSE 'permission_revoke' END,
      p_persona,'permission',p_permission,to_jsonb(was),to_jsonb(p_enabled));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_permission(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_permission(text,text,boolean) TO authenticated, service_role;

CREATE FUNCTION public.save_patient_accessibility(p_patient text,p_profile jsonb,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me public.app_users := public.current_persona(); pat public.patients;
  old_row public.patient_accessibility_profiles; new_row public.patient_accessibility_profiles;
  k text; needs_value text[]; methods_value text[]; primary_value text; other_value text;
BEGIN
  -- Lock the existing patient for creation/update serialization and care-team update ordering.
  SELECT * INTO pat FROM public.patients WHERE id = p_patient FOR UPDATE;
  IF pat.id IS NULL OR NOT public.can_manage_patient_accessibility(p_patient) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN RAISE EXCEPTION 'invalid'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_profile) LOOP
    IF k NOT IN ('needs','other_need','communication_methods','primary_method','interface_preferences','support_notes','review_status','next_review_date') THEN RAISE EXCEPTION 'invalid'; END IF;
  END LOOP;
  IF jsonb_typeof(p_profile->'needs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_profile->'communication_methods') IS DISTINCT FROM 'array'
    OR NOT public.accessibility_valid_interface(p_profile->'interface_preferences',false)
    OR jsonb_typeof(p_profile->'review_status') IS DISTINCT FROM 'string'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_profile->'needs') v WHERE jsonb_typeof(v) <> 'string')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_profile->'communication_methods') v WHERE jsonb_typeof(v) <> 'string')
    THEN RAISE EXCEPTION 'invalid'; END IF;
  FOREACH k IN ARRAY ARRAY['other_need','primary_method','support_notes','next_review_date'] LOOP
    IF p_profile ? k AND jsonb_typeof(p_profile->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'invalid'; END IF;
  END LOOP;
  needs_value := ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_profile->'needs') ORDER BY 1);
  methods_value := ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_profile->'communication_methods') ORDER BY 1);
  primary_value := nullif(p_profile->>'primary_method','');
  other_value := nullif(btrim(p_profile->>'other_need'),'');
  SELECT * INTO old_row FROM public.patient_accessibility_profiles WHERE patient_id = p_patient;
  IF coalesce(old_row.revision,0) <> p_expected_revision THEN RAISE EXCEPTION 'conflict'; END IF;
  INSERT INTO public.patient_accessibility_profiles(patient_id,needs,other_need,communication_methods,primary_method,
    staff_interface_preferences,support_notes,review_status,next_review_date,updated_at,updated_by,revision)
  VALUES (p_patient,needs_value,other_value,methods_value,primary_value,p_profile->'interface_preferences',
    nullif(btrim(p_profile->>'support_notes'),''),p_profile->>'review_status',nullif(p_profile->>'next_review_date','')::date,
    now(),me.persona_id,coalesce(old_row.revision,0)+1)
  ON CONFLICT (patient_id) DO UPDATE SET needs=excluded.needs,other_need=excluded.other_need,
    communication_methods=excluded.communication_methods,primary_method=excluded.primary_method,
    staff_interface_preferences=excluded.staff_interface_preferences,support_notes=excluded.support_notes,
    review_status=excluded.review_status,next_review_date=excluded.next_review_date,
    updated_at=excluded.updated_at,updated_by=excluded.updated_by,revision=excluded.revision
  RETURNING * INTO new_row;
  INSERT INTO public.patient_accessibility_history(patient_id,actor_id,source,old_value,new_value)
    VALUES (p_patient,me.persona_id,'staff_profile',CASE WHEN old_row.patient_id IS NULL THEN NULL ELSE to_jsonb(old_row) END,to_jsonb(new_row));
  -- Organization-wide audit carries change metadata only, never support notes or disability categories.
  INSERT INTO public.admin_audit_log(org_id,actor_id,action,resource_type,resource_id,old_value,new_value)
    VALUES (pat.org_id,me.persona_id,'accessibility_profile_update','patient_accessibility',p_patient,
      jsonb_build_object('revision',coalesce(old_row.revision,0)),jsonb_build_object('revision',new_row.revision));
  RETURN new_row.revision;
END $$;
REVOKE ALL ON FUNCTION public.save_patient_accessibility(text,jsonb,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_patient_accessibility(text,jsonb,bigint) TO authenticated, service_role;

CREATE FUNCTION public.save_patient_interface_preferences(p_patient text,p_preferences jsonb,p_methods text[],p_primary text,p_expected_revision bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE me public.app_users := public.current_persona(); pat public.patients;
  old_row public.patient_interface_preferences; new_row public.patient_interface_preferences;
BEGIN
  SELECT * INTO pat FROM public.patients WHERE id=p_patient FOR UPDATE;
  IF pat.id IS NULL OR NOT public.accessibility_patient_scope(p_patient) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
    OR NOT public.accessibility_valid_interface(p_preferences,true) OR p_methods IS NULL THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT * INTO old_row FROM public.patient_interface_preferences WHERE patient_id=p_patient;
  IF coalesce(old_row.revision,0) <> p_expected_revision THEN RAISE EXCEPTION 'conflict'; END IF;
  INSERT INTO public.patient_interface_preferences(patient_id,preferences,communication_methods,primary_method,updated_at,updated_by,revision)
    VALUES (p_patient,p_preferences,ARRAY(SELECT DISTINCT x FROM unnest(p_methods) x ORDER BY x),nullif(p_primary,''),now(),me.persona_id,coalesce(old_row.revision,0)+1)
  ON CONFLICT (patient_id) DO UPDATE SET preferences=excluded.preferences,communication_methods=excluded.communication_methods,
    primary_method=excluded.primary_method,updated_at=excluded.updated_at,updated_by=excluded.updated_by,revision=excluded.revision
  RETURNING * INTO new_row;
  INSERT INTO public.patient_accessibility_history(patient_id,actor_id,source,old_value,new_value)
    VALUES (p_patient,me.persona_id,'patient_preferences',CASE WHEN old_row.patient_id IS NULL THEN NULL ELSE to_jsonb(old_row) END,to_jsonb(new_row));
  INSERT INTO public.admin_audit_log(org_id,actor_id,action,resource_type,resource_id,old_value,new_value)
    VALUES (pat.org_id,me.persona_id,'patient_interface_update','patient_interface',p_patient,
      jsonb_build_object('revision',coalesce(old_row.revision,0)),jsonb_build_object('revision',new_row.revision));
  RETURN new_row.revision;
END $$;
REVOKE ALL ON FUNCTION public.save_patient_interface_preferences(text,jsonb,text[],text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_patient_interface_preferences(text,jsonb,text[],text,bigint) TO authenticated, service_role;

COMMENT ON TABLE public.patient_accessibility_profiles IS 'Staff-managed accessibility support, not diagnoses; one row per existing patient. Patient choices are separate.';
COMMENT ON TABLE public.patient_interface_preferences IS 'Patient-controlled nonclinical preferences. No staff support notes or permissions. No offline clinical caching.';
COMMENT ON TABLE public.patient_accessibility_history IS 'Append-only for authenticated users; sensitive snapshots visible only to currently scoped staff/admins.';
-- No seed_demo/reset_demo invocation. No automatic staff grants. No proposed patient configurations inserted.
-- Forward rollback: disable the new UI and revoke EXECUTE on the two save RPCs in a separately approved migration.
-- Retain new tables/history and any granted permissions for review rather than deleting patient information.
-- Restore admin_set_permission to its captured original definition only after UI rollback and permission review.
-- Do not rerun raw SQL after success: migration history ensures one application. A failed atomic migration rolls back.
