-- PalliaLink Care Hub — additive migration: nursing tasks, follow-ups, notifications.
-- No deletes, no updates to existing rows, no reseeding. Rerun-safe.

-- ============ 1. Nursing tasks (physician-initiated) ============
CREATE SEQUENCE IF NOT EXISTS public.nursing_task_seq START 1;

CREATE TABLE IF NOT EXISTS public.nursing_tasks (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(id),
  physician_id text NOT NULL REFERENCES public.app_users(persona_id),
  nurse_id text NOT NULL REFERENCES public.app_users(persona_id),
  category text NOT NULL CHECK (category IN
    ('pain_assessment','vital_signs','symptom_assessment','med_adherence','home_visit','general_followup','custom')),
  instructions text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine','urgent')),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN
    ('new','acknowledged','in_progress','completed_pending_review','reviewed','unable')),
  findings text,
  unable_reason text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ack_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz
);
GRANT SELECT ON public.nursing_tasks TO authenticated;
GRANT ALL ON public.nursing_tasks TO service_role;
ALTER TABLE public.nursing_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks visible to patient care team" ON public.nursing_tasks
  FOR SELECT TO authenticated
  USING (is_clinician() AND can_view_patient(patient_id));

CREATE TABLE IF NOT EXISTS public.nursing_task_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.nursing_tasks(id),
  at timestamptz NOT NULL DEFAULT now(),
  by_user_id text NOT NULL REFERENCES public.app_users(persona_id),
  type text NOT NULL,
  status text,
  note text
);
GRANT SELECT ON public.nursing_task_activity TO authenticated;
GRANT ALL ON public.nursing_task_activity TO service_role;
ALTER TABLE public.nursing_task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task activity visible with task" ON public.nursing_task_activity
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.nursing_tasks t
    WHERE t.id = task_id AND is_clinician() AND can_view_patient(t.patient_id)
  ));

-- ============ 2. Follow-up plans ============
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id text NOT NULL REFERENCES public.patients(id),
  purpose text NOT NULL,
  responsible_id text NOT NULL REFERENCES public.app_users(persona_id),
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  completion_notes text,
  created_by text NOT NULL REFERENCES public.app_users(persona_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow-ups visible to patient care team" ON public.follow_ups
  FOR SELECT TO authenticated
  USING (is_clinician() AND can_view_patient(patient_id));

-- ============ 3. In-app notifications ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.app_users(persona_id),
  patient_id text REFERENCES public.patients(id),
  kind text NOT NULL CHECK (kind IN
    ('task_assigned','task_completed','review_requested','patient_update','task_overdue')),
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (current_persona()).persona_id);

-- ============ 4. Checked write functions (security definer) ============

CREATE OR REPLACE FUNCTION public.create_nursing_task(
  p_patient text, p_nurse text, p_category text, p_instructions text,
  p_priority text, p_due_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me app_users := current_persona();
  pat patients;
  nurse app_users;
  new_id text;
BEGIN
  IF me.persona_id IS NULL OR me.role <> 'physician' OR NOT me.active THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO pat FROM patients WHERE id = p_patient;
  IF pat.id IS NULL OR pat.org_id <> me.org_id OR NOT (me.persona_id = ANY(pat.care_team)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO nurse FROM app_users WHERE persona_id = p_nurse;
  IF nurse.persona_id IS NULL OR nurse.role <> 'nurse' OR NOT nurse.active
     OR nurse.org_id <> pat.org_id OR NOT (nurse.persona_id = ANY(pat.care_team)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_category NOT IN ('pain_assessment','vital_signs','symptom_assessment','med_adherence','home_visit','general_followup','custom')
     OR p_priority NOT IN ('routine','urgent') THEN
    RAISE EXCEPTION 'invalid';
  END IF;
  new_id := 'NT-' || lpad(nextval('nursing_task_seq')::text, 4, '0');
  INSERT INTO nursing_tasks (id, patient_id, physician_id, nurse_id, category, instructions, priority, due_at)
  VALUES (new_id, p_patient, me.persona_id, p_nurse, p_category, left(coalesce(p_instructions,''), 2000), p_priority, p_due_at);
  INSERT INTO nursing_task_activity (task_id, by_user_id, type, status, note)
  VALUES (new_id, me.persona_id, 'created', 'new', left(coalesce(p_instructions,''), 500));
  INSERT INTO notifications (user_id, patient_id, kind, ref_id)
  VALUES (p_nurse, p_patient, 'task_assigned', new_id);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.nursing_task_action(
  p_id text, p_action text, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me app_users := current_persona();
  t nursing_tasks;
BEGIN
  SELECT * INTO t FROM nursing_tasks WHERE id = p_id;
  IF t.id IS NULL OR me.persona_id IS NULL OR NOT me.active THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_action IN ('ack','start','complete','unable') THEN
    IF me.role <> 'nurse' OR t.nurse_id <> me.persona_id THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_action = 'ack' AND t.status = 'new' THEN
      UPDATE nursing_tasks SET status='acknowledged', ack_at=now() WHERE id=p_id;
    ELSIF p_action = 'start' AND t.status IN ('acknowledged','new') THEN
      UPDATE nursing_tasks SET status='in_progress', started_at=now(),
        ack_at=coalesce(ack_at, now()) WHERE id=p_id;
    ELSIF p_action = 'complete' AND t.status IN ('in_progress','acknowledged') AND length(trim(coalesce(p_note,''))) > 0 THEN
      UPDATE nursing_tasks SET status='completed_pending_review', completed_at=now(),
        findings=left(p_note, 4000) WHERE id=p_id;
      INSERT INTO notifications (user_id, patient_id, kind, ref_id)
      VALUES (t.physician_id, t.patient_id, 'review_requested', p_id);
    ELSIF p_action = 'unable' AND t.status IN ('new','acknowledged','in_progress') AND length(trim(coalesce(p_note,''))) > 0 THEN
      UPDATE nursing_tasks SET status='unable', unable_reason=left(p_note, 2000), completed_at=now() WHERE id=p_id;
      INSERT INTO notifications (user_id, patient_id, kind, ref_id)
      VALUES (t.physician_id, t.patient_id, 'task_completed', p_id);
    ELSE RAISE EXCEPTION 'forbidden'; END IF;

  ELSIF p_action IN ('review','clarify') THEN
    IF me.role <> 'physician' OR t.physician_id <> me.persona_id THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_action = 'review' AND t.status = 'completed_pending_review' THEN
      UPDATE nursing_tasks SET status='reviewed', reviewed_at=now(),
        review_note=left(coalesce(p_note,''), 2000) WHERE id=p_id;
    ELSIF p_action = 'clarify' AND t.status IN ('completed_pending_review','unable') AND length(trim(coalesce(p_note,''))) > 0 THEN
      UPDATE nursing_tasks SET status='in_progress', completed_at=NULL,
        review_note=left(p_note, 2000) WHERE id=p_id;
    ELSE RAISE EXCEPTION 'forbidden'; END IF;
    INSERT INTO notifications (user_id, patient_id, kind, ref_id)
    VALUES (t.nurse_id, t.patient_id, 'task_completed', p_id);
  ELSE RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO nursing_task_activity (task_id, by_user_id, type, status, note)
  VALUES (p_id, me.persona_id, p_action,
    (SELECT status FROM nursing_tasks WHERE id = p_id), left(coalesce(p_note,''), 500));
END $$;

CREATE OR REPLACE FUNCTION public.list_care_team_nurses(p_patient text)
RETURNS TABLE(persona_id text, name_ar text, name_en text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := current_persona(); pat patients;
BEGIN
  SELECT * INTO pat FROM patients WHERE id = p_patient;
  IF pat.id IS NULL OR NOT is_clinician() OR NOT can_view_patient(p_patient) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT u.persona_id, u.name_ar, u.name_en FROM app_users u
    WHERE u.role = 'nurse' AND u.active AND u.org_id = pat.org_id
      AND u.persona_id = ANY(pat.care_team)
    ORDER BY u.name_ar;
END $$;

CREATE OR REPLACE FUNCTION public.create_followup(
  p_patient text, p_purpose text, p_responsible text, p_target_date date
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me app_users := current_persona();
  pat patients;
  resp app_users;
  new_id bigint;
BEGIN
  IF me.persona_id IS NULL OR me.role <> 'physician' OR NOT me.active THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO pat FROM patients WHERE id = p_patient;
  IF pat.id IS NULL OR pat.org_id <> me.org_id OR NOT (me.persona_id = ANY(pat.care_team)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO resp FROM app_users WHERE persona_id = p_responsible;
  IF resp.persona_id IS NULL OR resp.role NOT IN ('nurse','physician') OR NOT resp.active
     OR resp.org_id <> pat.org_id OR NOT (resp.persona_id = ANY(pat.care_team)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO follow_ups (patient_id, purpose, responsible_id, target_date, created_by)
  VALUES (p_patient, left(p_purpose, 1000), p_responsible, p_target_date, me.persona_id)
  RETURNING id INTO new_id;
  IF p_responsible <> me.persona_id THEN
    INSERT INTO notifications (user_id, patient_id, kind, ref_id)
    VALUES (p_responsible, p_patient, 'patient_update', new_id::text);
  END IF;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_followup(
  p_id bigint, p_status text, p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me app_users := current_persona();
  f follow_ups;
  pat patients;
BEGIN
  SELECT * INTO f FROM follow_ups WHERE id = p_id;
  IF f.id IS NULL OR me.persona_id IS NULL OR NOT me.active THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO pat FROM patients WHERE id = f.patient_id;
  IF NOT (me.persona_id = ANY(pat.care_team)) OR me.role NOT IN ('nurse','physician') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_status NOT IN ('done','cancelled') THEN RAISE EXCEPTION 'invalid'; END IF;
  UPDATE follow_ups SET status = p_status, completed_at = now(),
    completion_notes = left(coalesce(p_notes,''), 2000) WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_notifications()
RETURNS SETOF public.notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := current_persona();
BEGIN
  IF me.persona_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO notifications (user_id, patient_id, kind, ref_id)
  SELECT me.persona_id, t.patient_id, 'task_overdue', t.id
  FROM nursing_tasks t
  WHERE t.due_at < now()
    AND t.status IN ('new','acknowledged','in_progress')
    AND (t.nurse_id = me.persona_id OR t.physician_id = me.persona_id)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = me.persona_id AND n.kind = 'task_overdue' AND n.ref_id = t.id
    );
  RETURN QUERY
    SELECT * FROM notifications WHERE user_id = me.persona_id
    ORDER BY created_at DESC LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids bigint[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me app_users := current_persona();
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE id = ANY(p_ids) AND user_id = me.persona_id AND read_at IS NULL;
END $$;

-- ============ 5. Execute permissions ============
REVOKE EXECUTE ON FUNCTION public.create_nursing_task(text,text,text,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.nursing_task_action(text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_care_team_nurses(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_followup(text,text,text,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_followup(bigint,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_notifications() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_nursing_task(text,text,text,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nursing_task_action(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_care_team_nurses(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_followup(text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_followup(bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(bigint[]) TO authenticated;

-- ============ 6. Indexes ============
CREATE INDEX IF NOT EXISTS nursing_tasks_nurse_idx ON public.nursing_tasks (nurse_id, status);
CREATE INDEX IF NOT EXISTS nursing_tasks_physician_idx ON public.nursing_tasks (physician_id, status);
CREATE INDEX IF NOT EXISTS nursing_tasks_patient_idx ON public.nursing_tasks (patient_id);
CREATE INDEX IF NOT EXISTS follow_ups_patient_idx ON public.follow_ups (patient_id, target_date);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, read_at);