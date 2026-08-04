ALTER TABLE public.impayes ADD COLUMN IF NOT EXISTS date_dernier_paiement date;

CREATE OR REPLACE FUNCTION public.set_impaye_date_dernier_paiement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.montant_paye IS DISTINCT FROM OLD.montant_paye THEN
    NEW.date_dernier_paiement := CURRENT_DATE;
  ELSIF TG_OP = 'INSERT' AND COALESCE(NEW.montant_paye,0) > 0 AND NEW.date_dernier_paiement IS NULL THEN
    NEW.date_dernier_paiement := CURRENT_DATE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_impaye_date_dernier_paiement ON public.impayes;
CREATE TRIGGER trg_impaye_date_dernier_paiement
BEFORE INSERT OR UPDATE ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.set_impaye_date_dernier_paiement();

CREATE OR REPLACE FUNCTION public.log_impaye_historique()
RETURNS trigger
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
  IF NEW.montant_paye IS DISTINCT FROM OLD.montant_paye THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'montant_paye', OLD.montant_paye::text, NEW.montant_paye::text, _uid);
  END IF;
  IF NEW.date_derniere_relance IS DISTINCT FROM OLD.date_derniere_relance THEN
    INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_derniere_relance', OLD.date_derniere_relance::text, NEW.date_derniere_relance::text, _uid);
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
END $$;