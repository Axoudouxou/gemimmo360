
-- 1. New columns on impayes
ALTER TABLE public.impayes
  ADD COLUMN IF NOT EXISTS etape_traitement TEXT NOT NULL DEFAULT 'recouvrement',
  ADD COLUMN IF NOT EXISTS service_en_charge TEXT NOT NULL DEFAULT 'recouvrement',
  ADD COLUMN IF NOT EXISTS date_mise_en_demeure DATE,
  ADD COLUMN IF NOT EXISTS date_acte_commissaire DATE,
  ADD COLUMN IF NOT EXISTS date_assignation DATE;

-- 2. impaye_id on activites
ALTER TABLE public.activites
  ADD COLUMN IF NOT EXISTS impaye_id UUID REFERENCES public.impayes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activites_impaye_id ON public.activites(impaye_id);

-- 3. impayes_historique table
CREATE TABLE IF NOT EXISTS public.impayes_historique (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  impaye_id UUID NOT NULL REFERENCES public.impayes(id) ON DELETE CASCADE,
  champ_modifie TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  auteur UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.impayes_historique TO authenticated;
GRANT ALL ON public.impayes_historique TO service_role;

ALTER TABLE public.impayes_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Historique visible aux authentifies"
  ON public.impayes_historique FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_impayes_historique_impaye_id ON public.impayes_historique(impaye_id);

-- 4. Trigger to log changes
CREATE OR REPLACE FUNCTION public.log_impaye_historique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  IF NEW.etape_traitement IS DISTINCT FROM OLD.etape_traitement THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'etape_traitement', OLD.etape_traitement, NEW.etape_traitement, _uid);
  END IF;
  IF NEW.service_en_charge IS DISTINCT FROM OLD.service_en_charge THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'service_en_charge', OLD.service_en_charge, NEW.service_en_charge, _uid);
  END IF;
  IF NEW.date_mise_en_demeure IS DISTINCT FROM OLD.date_mise_en_demeure THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_mise_en_demeure', OLD.date_mise_en_demeure::text, NEW.date_mise_en_demeure::text, _uid);
  END IF;
  IF NEW.date_acte_commissaire IS DISTINCT FROM OLD.date_acte_commissaire THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_acte_commissaire', OLD.date_acte_commissaire::text, NEW.date_acte_commissaire::text, _uid);
  END IF;
  IF NEW.date_assignation IS DISTINCT FROM OLD.date_assignation THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_assignation', OLD.date_assignation::text, NEW.date_assignation::text, _uid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_impaye_historique_ins ON public.impayes;
DROP TRIGGER IF EXISTS trg_log_impaye_historique_upd ON public.impayes;

CREATE TRIGGER trg_log_impaye_historique_ins
AFTER INSERT ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.log_impaye_historique();

CREATE TRIGGER trg_log_impaye_historique_upd
AFTER UPDATE ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.log_impaye_historique();
