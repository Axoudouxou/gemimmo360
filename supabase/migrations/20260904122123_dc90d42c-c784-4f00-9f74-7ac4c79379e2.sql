DROP POLICY IF EXISTS travaux_docs_read ON storage.objects;
DROP POLICY IF EXISTS travaux_docs_write ON storage.objects;
DROP POLICY IF EXISTS travaux_docs_delete ON storage.objects;
DROP POLICY IF EXISTS contrats_docs_read ON storage.objects;
DROP POLICY IF EXISTS contrats_docs_write ON storage.objects;
DROP POLICY IF EXISTS contrats_docs_delete ON storage.objects;
DROP POLICY IF EXISTS reclamations_docs_read ON storage.objects;
DROP POLICY IF EXISTS reclamations_docs_write ON storage.objects;
DROP POLICY IF EXISTS reclamations_docs_delete ON storage.objects;

CREATE POLICY travaux_docs_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'travaux-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));
CREATE POLICY travaux_docs_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'travaux-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));
CREATE POLICY travaux_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'travaux-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));

CREATE POLICY contrats_docs_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contrats-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));
CREATE POLICY contrats_docs_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contrats-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','juridique','gestion_locative','commercial','technico_commercial'])));
CREATE POLICY contrats_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contrats-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','juridique','gestion_locative','commercial','technico_commercial'])));

CREATE POLICY reclamations_docs_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reclamations-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));
CREATE POLICY reclamations_docs_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reclamations-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));
CREATE POLICY reclamations_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reclamations-documents' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));