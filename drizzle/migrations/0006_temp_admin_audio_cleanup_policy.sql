CREATE POLICY "report audio admin cleanup" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-audio' AND (SELECT (public.current_persona()).role) = 'admin');