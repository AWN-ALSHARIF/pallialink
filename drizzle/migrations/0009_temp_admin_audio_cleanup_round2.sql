CREATE POLICY "report audio admin cleanup" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-audio' AND (SELECT (public.current_persona()).role) = 'admin');
CREATE POLICY "report audio admin cleanup read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report-audio' AND (SELECT (public.current_persona()).role) = 'admin');