CREATE TABLE public.echeances_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  echeance_id uuid NOT NULL REFERENCES public.echeances(id) ON DELETE CASCADE,
  champ text NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text,
  auteur uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX echeances_historique_echeance_idx ON public.echeances_historique(echeance_id, created_at);
GRANT SELECT ON public.echeances_historique TO authenticated;
GRANT ALL ON public.echeances_historique TO service_role;
ALTER TABLE public.echeances_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY echeances_historique_select ON public.echeances_historique FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'en_attente'));

-- Étape automatique selon les dates juridiques
CREATE OR REPLACE FUNCTION public.echeance_etape_from_dates() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.etape_traitement,'') = 'resolu' THEN RETURN NEW; END IF;
  IF (NEW.date_acte_commissaire IS NOT NULL OR NEW.date_assignation IS NOT NULL)
     AND (TG_OP = 'INSERT' OR NEW.date_acte_commissaire IS DISTINCT FROM OLD.date_acte_commissaire OR NEW.date_assignation IS DISTINCT FROM OLD.date_assignation) THEN
    NEW.etape_traitement := 'procedure_judiciaire';
  ELSIF NEW.date_mise_en_demeure IS NOT NULL AND NEW.date_acte_commissaire IS NULL AND NEW.date_assignation IS NULL
     AND (TG_OP = 'INSERT' OR NEW.date_mise_en_demeure IS DISTINCT FROM OLD.date_mise_en_demeure) THEN
    NEW.etape_traitement := 'mise_en_demeure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_echeance_etape_dates BEFORE INSERT OR UPDATE ON public.echeances FOR EACH ROW EXECUTE FUNCTION public.echeance_etape_from_dates();

-- Historique des statuts
CREATE OR REPLACE FUNCTION public.log_echeance_historique() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid();
BEGIN
  IF NEW.etape_traitement IS DISTINCT FROM OLD.etape_traitement THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'etape_traitement',OLD.etape_traitement,NEW.etape_traitement,_u); END IF;
  IF NEW.service_en_charge IS DISTINCT FROM OLD.service_en_charge THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'service_en_charge',OLD.service_en_charge,NEW.service_en_charge,_u); END IF;
  IF NEW.date_mise_en_demeure IS DISTINCT FROM OLD.date_mise_en_demeure THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'date_mise_en_demeure',OLD.date_mise_en_demeure::text,NEW.date_mise_en_demeure::text,_u); END IF;
  IF NEW.date_acte_commissaire IS DISTINCT FROM OLD.date_acte_commissaire THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'date_acte_commissaire',OLD.date_acte_commissaire::text,NEW.date_acte_commissaire::text,_u); END IF;
  IF NEW.date_assignation IS DISTINCT FROM OLD.date_assignation THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'date_assignation',OLD.date_assignation::text,NEW.date_assignation::text,_u); END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND (NEW.statut = 'solde' OR OLD.statut = 'solde') THEN
    INSERT INTO public.echeances_historique(echeance_id,champ,ancienne_valeur,nouvelle_valeur,auteur) VALUES (NEW.id,'cloture',OLD.statut,NEW.statut,_u); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_echeance_historique AFTER UPDATE ON public.echeances FOR EACH ROW EXECUTE FUNCTION public.log_echeance_historique();

-- Transfert au juridique (même effet que la modification manuelle)
CREATE OR REPLACE FUNCTION public.transferer_echeance_juridique(_echeance_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e public.echeances%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'gestion_locative')) THEN
    RAISE EXCEPTION 'Votre profil ne peut pas transférer un impayé au juridique';
  END IF;
  SELECT * INTO _e FROM public.echeances WHERE id = _echeance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Impayé introuvable'; END IF;
  IF _e.statut = 'solde' OR _e.etape_traitement = 'resolu' THEN RAISE EXCEPTION 'Impayé déjà résolu'; END IF;
  IF COALESCE(_e.service_en_charge,'recouvrement') <> 'recouvrement' THEN RAISE EXCEPTION 'Impayé déjà au juridique'; END IF;
  UPDATE public.echeances SET service_en_charge = 'juridique', etape_traitement = 'transfere_juridique' WHERE id = _echeance_id;
END $$;

-- Dates juridiques (Administrateur, Direction, Juridique)
CREATE OR REPLACE FUNCTION public.maj_dates_juridiques(_echeance_id uuid, _mise_en_demeure date, _acte date, _assignation date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'juridique')) THEN
    RAISE EXCEPTION 'Votre profil ne peut pas modifier le suivi juridique';
  END IF;
  UPDATE public.echeances SET date_mise_en_demeure = _mise_en_demeure, date_acte_commissaire = _acte, date_assignation = _assignation
   WHERE id = _echeance_id AND service_en_charge = 'juridique';
  IF NOT FOUND THEN RAISE EXCEPTION 'Impayé introuvable ou non transféré au juridique'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.transferer_echeance_juridique(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.maj_dates_juridiques(uuid,date,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferer_echeance_juridique(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maj_dates_juridiques(uuid,date,date,date) TO authenticated;