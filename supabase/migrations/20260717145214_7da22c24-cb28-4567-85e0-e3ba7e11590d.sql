
-- 1. motif_refus on travaux
ALTER TABLE public.travaux
  ADD COLUMN IF NOT EXISTS motif_refus TEXT;

-- 2. travaux_id on activites
ALTER TABLE public.activites
  ADD COLUMN IF NOT EXISTS travaux_id UUID REFERENCES public.travaux(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activites_travaux_id ON public.activites(travaux_id);

-- 3. travaux_historique table
CREATE TABLE IF NOT EXISTS public.travaux_historique (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  travaux_id UUID NOT NULL REFERENCES public.travaux(id) ON DELETE CASCADE,
  champ_modifie TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  auteur UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.travaux_historique TO authenticated;
GRANT ALL ON public.travaux_historique TO service_role;

ALTER TABLE public.travaux_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Historique travaux visible aux authentifies"
  ON public.travaux_historique FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_travaux_historique_travaux_id ON public.travaux_historique(travaux_id);

-- 4. Trigger to log status changes
CREATE OR REPLACE FUNCTION public.log_travaux_historique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  IF NEW.motif_refus IS DISTINCT FROM OLD.motif_refus AND NEW.motif_refus IS NOT NULL THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'motif_refus', OLD.motif_refus, NEW.motif_refus, _uid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_travaux_historique_ins ON public.travaux;
DROP TRIGGER IF EXISTS trg_log_travaux_historique_upd ON public.travaux;

CREATE TRIGGER trg_log_travaux_historique_ins
AFTER INSERT ON public.travaux
FOR EACH ROW EXECUTE FUNCTION public.log_travaux_historique();

CREATE TRIGGER trg_log_travaux_historique_upd
AFTER UPDATE ON public.travaux
FOR EACH ROW EXECUTE FUNCTION public.log_travaux_historique();
