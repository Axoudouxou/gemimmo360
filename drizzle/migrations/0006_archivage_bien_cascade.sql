ALTER TABLE public.contrats ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS archive_bien_id uuid;

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
  UPDATE public.contrats SET archive = true
   WHERE lot_id IN (SELECT id FROM public.lots WHERE bien_id = _bien_id);
  -- Locataires sans autre contrat actif sur un bien non archivé
  UPDATE public.contacts ct SET archive = true, archive_bien_id = _bien_id, updated_at = now()
   WHERE ct.archive = false
     AND ct.id IN (SELECT c.locataire_id FROM public.contrats c JOIN public.lots l ON l.id = c.lot_id WHERE l.bien_id = _bien_id)
     AND NOT EXISTS (SELECT 1 FROM public.contrats c2 WHERE c2.locataire_id = ct.id AND c2.archive = false AND c2.statut = 'actif')
     AND NOT EXISTS (SELECT 1 FROM public.biens b WHERE b.bailleur_id = ct.id AND b.archive = false AND b.id <> _bien_id);
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
  UPDATE public.contrats SET archive = false WHERE lot_id IN (SELECT id FROM public.lots WHERE bien_id = _bien_id);
  UPDATE public.contacts SET archive = false, archive_bien_id = NULL, updated_at = now() WHERE archive_bien_id = _bien_id;
  UPDATE public.biens SET archive = false, updated_at = now() WHERE id = _bien_id;
END $$;