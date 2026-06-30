
CREATE POLICY "briefings owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "briefings owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "briefings owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "briefings owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "briefings service all" ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'briefings') WITH CHECK (bucket_id = 'briefings');
