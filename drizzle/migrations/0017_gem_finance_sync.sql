ALTER TABLE public.decomptes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.decomptes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.decomptes ADD COLUMN IF NOT EXISTS pdf_path text;
UPDATE public.decomptes SET updated_at = created_at;
CREATE INDEX IF NOT EXISTS decomptes_updated_at_idx ON public.decomptes(updated_at);
CREATE INDEX IF NOT EXISTS echeances_updated_at_idx ON public.echeances(updated_at);
CREATE INDEX IF NOT EXISTS paiements_updated_at_idx ON public.paiements(updated_at);

CREATE OR REPLACE FUNCTION public.attacher_pdf_decompte(_decompte_id uuid, _path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_staff_actif() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _path IS DISTINCT FROM (_decompte_id::text || '.pdf') THEN RAISE EXCEPTION 'Chemin invalide'; END IF;
  UPDATE public.decomptes SET pdf_path = _path, updated_at = now()
   WHERE id = _decompte_id AND pdf_path IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.attacher_pdf_decompte(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attacher_pdf_decompte(uuid, text) TO authenticated;

CREATE POLICY "decomptes_pdf_insert_staff" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'decomptes-pdf' AND public.is_staff_actif());
CREATE POLICY "decomptes_pdf_select_staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'decomptes-pdf' AND public.is_staff_actif());