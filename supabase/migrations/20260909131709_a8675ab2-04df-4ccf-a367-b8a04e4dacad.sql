CREATE OR REPLACE FUNCTION public.create_task_on_echeance_juridique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assignee uuid;
  _locataire text;
  _bien text;
  _reste numeric;
  _priorite text;
  _titre text;
BEGIN
  IF COALESCE(NEW.service_en_charge, 'recouvrement') <> 'juridique' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.service_en_charge, 'recouvrement') = 'juridique' THEN
    RETURN NEW;
  END IF;

  _assignee := public.get_juridique_assignee();
  IF _assignee IS NULL THEN RETURN NEW; END IF;

  _reste := GREATEST(COALESCE(NEW.montant_du, 0) - COALESCE(NEW.montant_affecte, 0), 0);

  SELECT COALESCE(NULLIF(TRIM(COALESCE(ct.nom, '') || ' ' || COALESCE(ct.prenom, '')), ''), 'locataire'),
         COALESCE(NULLIF(TRIM(COALESCE(b.titre, '') || ' — ' || COALESCE(l.label, '')), '— '), '—')
    INTO _locataire, _bien
    FROM public.contrats c
    LEFT JOIN public.contacts ct ON ct.id = c.locataire_id
    LEFT JOIN public.lots l ON l.id = c.lot_id
    LEFT JOIN public.biens b ON b.id = l.bien_id
   WHERE c.id = NEW.contrat_id;

  IF EXISTS (
    SELECT 1 FROM public.activites a
     WHERE a.contrat_id = NEW.contrat_id
       AND a.statut IN ('a_faire', 'en_cours')
       AND a.titre LIKE 'Impayé transféré au juridique – %' || to_char(NEW.periode, 'MM/YYYY')
  ) THEN
    RETURN NEW;
  END IF;

  _priorite := CASE WHEN CURRENT_DATE - NEW.date_echeance > 25 THEN 'urgente' ELSE 'normale' END;
  _titre := 'Impayé transféré au juridique – ' || COALESCE(_locataire, 'locataire')
            || ' – ' || COALESCE(_bien, '—')
            || ' – ' || to_char(NEW.periode, 'MM/YYYY');

  INSERT INTO public.activites(titre, type_activite, assigne_a, created_by, priorite, statut, contrat_id, date_debut, date_fin, notes)
  VALUES (
    _titre, 'tache', _assignee, COALESCE(NEW.created_by, auth.uid()), _priorite, 'a_faire',
    NEW.contrat_id, now(), (CURRENT_DATE + INTERVAL '7 days')::timestamptz,
    'Reste dû : ' || to_char(_reste, 'FM999G999G999') || ' FCFA. Traiter la procédure juridique.'
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_echeance_juridique_task ON public.echeances;
CREATE TRIGGER trg_echeance_juridique_task
  AFTER INSERT OR UPDATE OF service_en_charge ON public.echeances
  FOR EACH ROW EXECUTE FUNCTION public.create_task_on_echeance_juridique();