
-- RLS policies for document buckets

-- edl-documents: read for any non-en_attente, write for gestionnaires+technique
CREATE POLICY "edl_docs_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'edl-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial','recouvrement')
  )
);
CREATE POLICY "edl_docs_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'edl-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial')
  )
);
CREATE POLICY "edl_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'edl-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial')
  )
);

-- travaux-documents
CREATE POLICY "travaux_docs_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'travaux-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial','recouvrement')
  )
);
CREATE POLICY "travaux_docs_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'travaux-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial')
  )
);
CREATE POLICY "travaux_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'travaux-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial')
  )
);

-- contrats-documents
CREATE POLICY "contrats_docs_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'contrats-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','direction','juridique','gestion_locative','technique','commercial','recouvrement')
  )
);
CREATE POLICY "contrats_docs_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'contrats-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','juridique','gestion_locative','commercial')
  )
);
CREATE POLICY "contrats_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'contrats-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.role IN ('admin','juridique','gestion_locative','commercial')
  )
);
