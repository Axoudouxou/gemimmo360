
-- 1. TABLE impots_fonciers
CREATE TABLE public.impots_fonciers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bailleur_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  bien_id UUID NOT NULL REFERENCES public.biens(id) ON DELETE RESTRICT,
  annee_fiscale INTEGER NOT NULL,
  trimestre TEXT NOT NULL CHECK (trimestre IN ('T1','T2','T3','T4')),
  date_echeance DATE NOT NULL,
  montant NUMERIC,
  statut TEXT NOT NULL DEFAULT 'a_retirer' CHECK (statut IN ('a_retirer','a_payer','paye','recu_recupere')),
  date_paiement DATE,
  date_recuperation_recu DATE,
  reference_cheque TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impots_fonciers TO authenticated;
GRANT ALL ON public.impots_fonciers TO service_role;
ALTER TABLE public.impots_fonciers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fisc_impots_full_juridique_admin_direction"
  ON public.impots_fonciers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'juridique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'))
  WITH CHECK (public.has_role(auth.uid(),'juridique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));
CREATE TRIGGER update_impots_fonciers_updated_at BEFORE UPDATE ON public.impots_fonciers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. TABLE honoraires_fiscaux
CREATE TABLE public.honoraires_fiscaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bailleur_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  type_honoraire TEXT NOT NULL CHECK (type_honoraire IN ('suivi_fiscal','declaration_fonciere')),
  montant NUMERIC NOT NULL DEFAULT 50000,
  periode TEXT,
  periode_fin DATE,
  statut TEXT NOT NULL DEFAULT 'a_facturer' CHECK (statut IN ('a_facturer','facture','paye')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.honoraires_fiscaux TO authenticated;
GRANT ALL ON public.honoraires_fiscaux TO service_role;
ALTER TABLE public.honoraires_fiscaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fisc_honoraires_full_juridique_admin_direction"
  ON public.honoraires_fiscaux FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'juridique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'))
  WITH CHECK (public.has_role(auth.uid(),'juridique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));
CREATE TRIGGER update_honoraires_fiscaux_updated_at BEFORE UPDATE ON public.honoraires_fiscaux FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. TABLE honoraires_historique
CREATE TABLE public.honoraires_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  honoraire_id UUID NOT NULL REFERENCES public.honoraires_fiscaux(id) ON DELETE CASCADE,
  champ_modifie TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  auteur UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.honoraires_historique TO authenticated;
GRANT ALL ON public.honoraires_historique TO service_role;
ALTER TABLE public.honoraires_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fisc_honoraires_hist_read"
  ON public.honoraires_historique FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'juridique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

-- 4. Colonnes de liaison sur activites
ALTER TABLE public.activites ADD COLUMN impot_foncier_id UUID REFERENCES public.impots_fonciers(id) ON DELETE SET NULL;
ALTER TABLE public.activites ADD COLUMN honoraire_id UUID REFERENCES public.honoraires_fiscaux(id) ON DELETE SET NULL;
CREATE INDEX idx_activites_impot_foncier_id ON public.activites(impot_foncier_id);
CREATE INDEX idx_activites_honoraire_id ON public.activites(honoraire_id);

-- 5. Helper : trouver un assigné juridique (fallback admin/direction)
CREATE OR REPLACE FUNCTION public.get_juridique_assignee()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE role = 'juridique' ORDER BY created_at LIMIT 1
$$;

-- 6. Trigger historique honoraires
CREATE OR REPLACE FUNCTION public.log_honoraire_historique()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.honoraires_historique(honoraire_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.honoraires_historique(honoraire_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_honoraire_historique
  AFTER INSERT OR UPDATE ON public.honoraires_fiscaux
  FOR EACH ROW EXECUTE FUNCTION public.log_honoraire_historique();

-- 7. Trigger : suivi_fiscal → tâche automatique
CREATE OR REPLACE FUNCTION public.create_task_for_suivi_fiscal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee UUID; _bailleur TEXT; _due TIMESTAMPTZ;
BEGIN
  IF NEW.type_honoraire <> 'suivi_fiscal' THEN RETURN NEW; END IF;
  _assignee := public.get_juridique_assignee();
  IF _assignee IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')),''),'bailleur') INTO _bailleur
    FROM public.contacts WHERE id = NEW.bailleur_id;
  _due := COALESCE(NEW.periode_fin::timestamptz, now() + interval '30 days');
  INSERT INTO public.activites(titre, type_activite, assigne_a, created_by, priorite, statut, honoraire_id, date_debut, date_fin, notes)
  VALUES (
    'Suivi fiscal – ' || _bailleur || ' – ' || COALESCE(NEW.periode,''),
    'tache', _assignee, NEW.created_by, 'normale', 'a_faire', NEW.id, _due, _due,
    'Vérifier la situation fiscale des biens du bailleur pour la période.'
  );
  RETURN NEW;
END $$;
CREATE TRIGGER trg_task_suivi_fiscal
  AFTER INSERT ON public.honoraires_fiscaux
  FOR EACH ROW EXECUTE FUNCTION public.create_task_for_suivi_fiscal();

-- 8. Trigger : tâche liée à un honoraire passe "fait" → honoraire à_facturer
CREATE OR REPLACE FUNCTION public.on_activite_suivi_fiscal_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.honoraire_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.statut = 'fait' AND OLD.statut IS DISTINCT FROM 'fait' THEN
    UPDATE public.honoraires_fiscaux
      SET statut = 'a_facturer'
      WHERE id = NEW.honoraire_id AND statut NOT IN ('a_facturer','facture','paye');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_activite_honoraire_done
  AFTER UPDATE ON public.activites
  FOR EACH ROW EXECUTE FUNCTION public.on_activite_suivi_fiscal_done();

-- 9. Trigger : IF passe "paye" → tâche récupérer reçu à J+7
CREATE OR REPLACE FUNCTION public.on_impot_foncier_paye()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee UUID; _bailleur TEXT; _due TIMESTAMPTZ;
BEGIN
  IF NEW.statut <> 'paye' OR OLD.statut = 'paye' THEN RETURN NEW; END IF;
  _assignee := public.get_juridique_assignee();
  IF _assignee IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')),''),'bailleur') INTO _bailleur
    FROM public.contacts WHERE id = NEW.bailleur_id;
  _due := (COALESCE(NEW.date_paiement, CURRENT_DATE) + INTERVAL '7 days')::timestamptz;
  INSERT INTO public.activites(titre, type_activite, assigne_a, created_by, priorite, statut, impot_foncier_id, date_debut, date_fin)
  VALUES (
    'Récupérer le reçu IF – ' || _bailleur || ' – ' || NEW.trimestre || ' ' || NEW.annee_fiscale,
    'tache', _assignee, auth.uid(), 'normale', 'a_faire', NEW.id, _due, _due
  );
  RETURN NEW;
END $$;
CREATE TRIGGER trg_impot_foncier_paye
  AFTER UPDATE ON public.impots_fonciers
  FOR EACH ROW EXECUTE FUNCTION public.on_impot_foncier_paye();

-- 10. Fonction pour tâches trimestrielles IF
CREATE OR REPLACE FUNCTION public.generate_quarterly_if_tasks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee UUID; _list TEXT;
BEGIN
  _assignee := public.get_juridique_assignee();
  IF _assignee IS NULL THEN RETURN; END IF;
  SELECT string_agg(
    COALESCE(NULLIF(TRIM(COALESCE(c.prenom,'') || ' ' || COALESCE(c.nom,'')),''),'?')
    || ' (' || i.trimestre || ' - échéance ' || to_char(i.date_echeance,'DD/MM/YYYY') || ')',
    E'\n')
  INTO _list
  FROM public.impots_fonciers i
  JOIN public.contacts c ON c.id = i.bailleur_id
  WHERE i.statut IN ('a_retirer','a_payer')
    AND i.date_echeance BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '15 days';
  IF _list IS NULL THEN RETURN; END IF;
  INSERT INTO public.activites(titre, type_activite, assigne_a, priorite, statut, date_debut, date_fin, notes)
  VALUES (
    'Échéances IF à venir (' || to_char(CURRENT_DATE,'DD/MM/YYYY') || ')',
    'tache', _assignee, 'urgente', 'a_faire', now(), now() + INTERVAL '15 days',
    'Bailleurs concernés :' || E'\n' || _list
  );
END $$;

-- 11. Fonction rappel honoraires à facturer
CREATE OR REPLACE FUNCTION public.generate_honoraires_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee UUID; r RECORD; _bailleur TEXT;
BEGIN
  _assignee := public.get_juridique_assignee();
  IF _assignee IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT h.* FROM public.honoraires_fiscaux h
    WHERE h.statut = 'a_facturer'
      AND h.periode_fin IS NOT NULL
      AND h.periode_fin < CURRENT_DATE - INTERVAL '15 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.activites a
        WHERE a.honoraire_id = h.id
          AND a.titre LIKE 'Facturer honoraires en attente%'
          AND a.statut <> 'fait'
      )
  LOOP
    SELECT COALESCE(NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')),''),'bailleur') INTO _bailleur
      FROM public.contacts WHERE id = r.bailleur_id;
    INSERT INTO public.activites(titre, type_activite, assigne_a, priorite, statut, date_debut, date_fin, honoraire_id)
    VALUES (
      'Facturer honoraires en attente – ' || _bailleur || ' – ' || r.type_honoraire || ' – ' || r.montant::text || ' FCFA',
      'tache', _assignee, 'normale', 'a_faire', now(), now() + INTERVAL '7 days', r.id
    );
  END LOOP;
END $$;

-- 12. Cron jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fisc_quarterly_if_tasks') THEN
    PERFORM cron.unschedule('fisc_quarterly_if_tasks');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fisc_honoraires_reminders') THEN
    PERFORM cron.unschedule('fisc_honoraires_reminders');
  END IF;
END $$;
SELECT cron.schedule('fisc_quarterly_if_tasks', '0 8 1 3,6,9,12 *', $$SELECT public.generate_quarterly_if_tasks();$$);
SELECT cron.schedule('fisc_honoraires_reminders', '0 9 * * *', $$SELECT public.generate_honoraires_reminders();$$);
