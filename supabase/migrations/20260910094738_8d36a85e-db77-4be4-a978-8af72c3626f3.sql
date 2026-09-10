DROP POLICY IF EXISTS travaux_docs_delete ON storage.objects;
CREATE POLICY travaux_docs_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'travaux-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));