DROP POLICY IF EXISTS travaux_select ON public.travaux;
CREATE POLICY travaux_select ON public.travaux
FOR SELECT TO authenticated
USING (NOT has_role(auth.uid(), 'en_attente'));

DROP POLICY IF EXISTS travaux_docs_write ON storage.objects;
CREATE POLICY travaux_docs_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'travaux-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
  AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','technico_commercial','commercial','recouvrement'])));