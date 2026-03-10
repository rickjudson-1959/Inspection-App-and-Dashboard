CREATE POLICY "lem_uploads_insert" ON storage.objects 
FOR INSERT TO authenticated, anon 
WITH CHECK (bucket_id = 'lem-uploads');

CREATE POLICY "lem_uploads_update" ON storage.objects 
FOR UPDATE TO authenticated, anon 
USING (bucket_id = 'lem-uploads')
WITH CHECK (bucket_id = 'lem-uploads');

CREATE POLICY "lem_uploads_select" ON storage.objects 
FOR SELECT TO public 
USING (bucket_id = 'lem-uploads');
