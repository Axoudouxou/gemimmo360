
ALTER TABLE public.impots_fonciers
  ADD COLUMN IF NOT EXISTS montant_penalite NUMERIC,
  ADD COLUMN IF NOT EXISTS motif_penalite TEXT;

CREATE POLICY "impots_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'impots-fonciers-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','direction','juridique')
  ));

CREATE POLICY "impots_docs_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'impots-fonciers-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','direction','juridique')
  ));

CREATE POLICY "impots_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'impots-fonciers-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','direction','juridique')
  ));
