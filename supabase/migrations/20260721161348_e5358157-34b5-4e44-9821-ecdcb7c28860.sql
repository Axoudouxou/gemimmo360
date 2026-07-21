CREATE TABLE IF NOT EXISTS public.impots_fonciers_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impot_foncier_id uuid NOT NULL REFERENCES public.impots_fonciers(id) ON DELETE CASCADE,
  champ_modifie text NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text,
  auteur uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.impots_fonciers_historique TO authenticated;
GRANT ALL ON public.impots_fonciers_historique TO service_role;

ALTER TABLE public.impots_fonciers_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read impots historique (juridique/admin/direction)"
  ON public.impots_fonciers_historique FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'direction')
    OR public.has_role(auth.uid(), 'juridique')
  );

CREATE POLICY "Insert impots historique (system)"
  ON public.impots_fonciers_historique FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_impot_foncier_historique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  IF NEW.montant IS DISTINCT FROM OLD.montant THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'montant', OLD.montant::text, NEW.montant::text, _uid);
  END IF;
  IF NEW.montant_annuel_total IS DISTINCT FROM OLD.montant_annuel_total THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'montant_annuel_total', OLD.montant_annuel_total::text, NEW.montant_annuel_total::text, _uid);
  END IF;
  IF NEW.date_echeance IS DISTINCT FROM OLD.date_echeance THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_echeance', OLD.date_echeance::text, NEW.date_echeance::text, _uid);
  END IF;
  IF NEW.date_paiement IS DISTINCT FROM OLD.date_paiement THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_paiement', OLD.date_paiement::text, NEW.date_paiement::text, _uid);
  END IF;
  IF NEW.date_recuperation_recu IS DISTINCT FROM OLD.date_recuperation_recu THEN
    INSERT INTO public.impots_fonciers_historique(impot_foncier_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_recuperation_recu', OLD.date_recuperation_recu::text, NEW.date_recuperation_recu::text, _uid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_impot_foncier_historique ON public.impots_fonciers;
CREATE TRIGGER trg_log_impot_foncier_historique
  AFTER INSERT OR UPDATE ON public.impots_fonciers
  FOR EACH ROW EXECUTE FUNCTION public.log_impot_foncier_historique();