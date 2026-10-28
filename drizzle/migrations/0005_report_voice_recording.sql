ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS audio_path text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS audio_duration_s integer;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS audio_mime text;

CREATE POLICY "report audio upload by own patient"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-audio'
  AND (public.current_persona()).role IN ('patient','caregiver')
  AND (storage.foldername(name))[1] = (public.current_persona()).patient_id
);

CREATE POLICY "report audio read by report access"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-audio'
  AND EXISTS (SELECT 1 FROM public.reports r WHERE r.audio_path = storage.objects.name AND public.can_view_report(r.id))
);

DROP FUNCTION IF EXISTS public.submit_report(integer, text[], text);

CREATE OR REPLACE FUNCTION public.submit_report(p_pain integer, p_symptoms text[], p_notes text,
  p_audio_path text DEFAULT NULL, p_audio_duration integer DEFAULT NULL, p_audio_mime text DEFAULT NULL)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare u app_users := current_persona(); rid text; now_ts timestamptz := now();
begin
  if u.persona_id is null or u.role not in ('patient','caregiver') or u.patient_id is null then raise exception 'forbidden'; end if;
  if p_pain is null or p_pain < 0 or p_pain > 10 then raise exception 'invalid pain'; end if;
  if not (coalesce(p_symptoms,'{}') <@ array['nausea','fatigue','breathlessness','sleep','other']) then raise exception 'invalid symptoms'; end if;
  if p_audio_path is not null then
    if p_audio_duration is null or p_audio_duration < 1 or p_audio_duration > 60 then raise exception 'invalid audio duration'; end if;
    if split_part(coalesce(p_audio_mime,''), ';', 1) not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') then raise exception 'invalid audio format'; end if;
    if split_part(p_audio_path, '/', 1) <> u.patient_id then raise exception 'forbidden'; end if;
    if exists (select 1 from reports where audio_path = p_audio_path) then raise exception 'audio already used'; end if;
    if not exists (select 1 from storage.objects where bucket_id='report-audio' and name=p_audio_path) then raise exception 'audio not found'; end if;
  end if;
  rid := 'PL-' || lpad(nextval('report_seq')::text, 5, '0');
  insert into reports(id, patient_id, submitted_by, created_at, pain, symptoms, notes, audio_path, audio_duration_s, audio_mime)
  values (rid, u.patient_id, u.persona_id, now_ts, p_pain, coalesce(p_symptoms,'{}'), left(coalesce(p_notes,''),1000),
          p_audio_path, case when p_audio_path is null then null else p_audio_duration end, case when p_audio_path is null then null else p_audio_mime end);
  insert into report_activity(report_id, at, by_user_id, type) values (rid, now_ts, u.persona_id, 'created');
  return rid;
end $function$;

REVOKE ALL ON FUNCTION public.submit_report(integer, text[], text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report(integer, text[], text, text, integer, text) TO authenticated;