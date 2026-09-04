DROP POLICY IF EXISTS edl_docs_read ON storage.objects;
DROP POLICY IF EXISTS edl_docs_write ON storage.objects;
DROP POLICY IF EXISTS edl_docs_delete ON storage.objects;

CREATE POLICY edl_docs_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'edl-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));

CREATE POLICY edl_docs_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'edl-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));

CREATE POLICY edl_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'edl-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial'])));