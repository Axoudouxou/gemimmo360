ALTER TABLE public.biens ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;
ALTER TABLE public.biens ADD COLUMN IF NOT EXISTS date_fin_gestion date;
ALTER TABLE public.biens ADD COLUMN IF NOT EXISTS motif_archivage text;

CREATE OR REPLACE VIEW public.echeances_actives WITH (security_invoker = true) AS
SELECT e.* FROM public.echeances e
JOIN public.contrats c ON c.id = e.contrat_id
JOIN public.lots l ON l.id = c.lot_id
JOIN public.biens b ON b.id = l.bien_id
WHERE b.archive = false;
GRANT SELECT ON public.echeances_actives TO authenticated;
GRANT ALL ON public.echeances_actives TO service_role;

CREATE OR REPLACE FUNCTION public.archiver_bien(_bien_id uuid, _date date, _motif text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')) THEN
    RAISE EXCEPTION 'Seuls Administrateur et Direction peuvent archiver un bien';
  END IF;
  UPDATE public.contrats SET statut = 'resilie', date_fin = COALESCE(_date, current_date), updated_at = now()
   WHERE statut = 'actif' AND lot_id IN (SELECT id FROM public.lots WHERE bien_id = _bien_id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  UPDATE public.biens SET archive = true, date_fin_gestion = COALESCE(_date, current_date), motif_archivage = _motif, updated_at = now()
   WHERE id = _bien_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bien introuvable'; END IF;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.restaurer_bien(_bien_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')) THEN
    RAISE EXCEPTION 'Seuls Administrateur et Direction peuvent restaurer un bien';
  END IF;
  UPDATE public.biens SET archive = false, updated_at = now() WHERE id = _bien_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.archiver_bien(uuid,date,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restaurer_bien(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archiver_bien(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurer_bien(uuid) TO authenticated;