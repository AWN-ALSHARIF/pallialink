CREATE TABLE public.report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES public.reports(id),
  kind text NOT NULL CHECK (kind = 'image'),
  bucket_id text NOT NULL CHECK (bucket_id = 'report-images'),
  path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, position)
);
GRANT SELECT ON public.report_attachments TO authenticated;
GRANT ALL ON public.report_attachments TO service_role;
ALTER TABLE public.report_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachment read by report access" ON public.report_attachments
FOR SELECT TO authenticated USING (public.can_view_report(report_id));
CREATE INDEX report_attachments_report_idx ON public.report_attachments(report_id);
CREATE FUNCTION public.can_read_report_image(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT EXISTS (SELECT 1 FROM public.report_attachments a
 WHERE a.path = p_path AND a.bucket_id = 'report-images'
 AND public.can_view_report(a.report_id))
$$;
REVOKE ALL ON FUNCTION public.can_read_report_image(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_report_image(text) TO authenticated;
CREATE FUNCTION public.can_delete_pending_report_image(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT EXISTS (SELECT 1 FROM public.current_persona() u
 WHERE u.persona_id IS NOT NULL AND u.active AND u.role IN ('patient','caregiver')
 AND u.patient_id = split_part(p_path,'/',1))
 AND NOT EXISTS (SELECT 1 FROM public.report_attachments a WHERE a.path = p_path)
$$;
REVOKE ALL ON FUNCTION public.can_delete_pending_report_image(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_pending_report_image(text) TO authenticated;
CREATE POLICY "report image upload by linked patient" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id = 'report-images'
 AND (public.current_persona()).role IN ('patient','caregiver')
 AND (public.current_persona()).patient_id = split_part(name,'/',1)
 AND owner_id = (SELECT auth.uid())::text
);
CREATE POLICY "report image read by report access" ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id = 'report-images' AND public.can_read_report_image(name)
);
CREATE POLICY "pending report image owner read" ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id = 'report-images' AND owner_id = (SELECT auth.uid())::text
 AND public.can_delete_pending_report_image(name)
);
CREATE POLICY "pending report image owner delete" ON storage.objects
FOR DELETE TO authenticated USING (
 bucket_id = 'report-images' AND owner_id = (SELECT auth.uid())::text
 AND public.can_delete_pending_report_image(name)
);
CREATE FUNCTION public.submit_report_multimodal(
 p_pain integer, p_symptoms text[], p_notes text,
 p_images jsonb DEFAULT '[]'::jsonb,
 p_audio_path text DEFAULT NULL,
 p_audio_duration integer DEFAULT NULL,
 p_audio_mime text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
 u public.app_users := public.current_persona();
 item jsonb; image_path text; obj storage.objects; rid text; pos integer := 0;
 seen text[] := '{}';
BEGIN
 IF u.persona_id IS NULL OR NOT u.active OR u.role NOT IN ('patient','caregiver')
 OR u.patient_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
 RAISE EXCEPTION 'invalid images'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_images) LOOP
   IF jsonb_typeof(item) <> 'object' OR jsonb_typeof(item->'path') <> 'string'
   OR item - 'path' <> '{}'::jsonb THEN RAISE EXCEPTION 'invalid image'; END IF;
   image_path := item->>'path';
   IF split_part(image_path,'/',1) <> u.patient_id OR image_path = ANY(seen)
   THEN RAISE EXCEPTION 'invalid image path'; END IF;
   SELECT * INTO obj FROM storage.objects
   WHERE bucket_id = 'report-images' AND name = image_path FOR UPDATE;
   IF NOT FOUND OR obj.owner_id IS DISTINCT FROM auth.uid()::text
   THEN RAISE EXCEPTION 'image not found'; END IF;
   IF obj.metadata->>'mimetype' IS NULL
   OR obj.metadata->>'mimetype' NOT IN ('image/jpeg','image/png','image/webp')
   OR coalesce(obj.metadata->>'size','') !~ '^[0-9]{1,12}$'
   THEN RAISE EXCEPTION 'invalid image metadata'; END IF;
   IF (obj.metadata->>'size')::bigint NOT BETWEEN 1 AND 10485760
   THEN RAISE EXCEPTION 'invalid image size'; END IF;
   IF EXISTS (SELECT 1 FROM public.report_attachments WHERE path = image_path)
   THEN RAISE EXCEPTION 'image already used'; END IF;
   seen := array_append(seen, image_path);
 END LOOP;
 rid := public.submit_report(p_pain, p_symptoms, p_notes,
   p_audio_path, p_audio_duration, p_audio_mime);
 FOREACH image_path IN ARRAY seen LOOP
   SELECT * INTO STRICT obj FROM storage.objects
   WHERE bucket_id = 'report-images' AND name = image_path;
   INSERT INTO public.report_attachments(report_id,kind,bucket_id,path,mime_type,size_bytes,position)
   VALUES (rid,'image','report-images',image_path,obj.metadata->>'mimetype',
     (obj.metadata->>'size')::bigint,pos);
   pos := pos + 1;
 END LOOP;
 RETURN rid;
END
$$;
REVOKE ALL ON FUNCTION public.submit_report_multimodal(integer,text[],text,jsonb,text,integer,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report_multimodal(integer,text[],text,jsonb,text,integer,text)
TO authenticated;