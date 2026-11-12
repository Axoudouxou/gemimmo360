CREATE OR REPLACE FUNCTION public.generate_honoraires_reminders()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
          AND a.statut <> 'annulee'
      )
  LOOP
    SELECT COALESCE(NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')),''),'bailleur') INTO _bailleur
      FROM public.contacts WHERE id = r.bailleur_id;
    INSERT INTO public.activites(titre, type_activite, assigne_a, priorite, statut, date_debut, date_fin, honoraire_id)
    VALUES ('Facturer honoraires en attente – ' || _bailleur || ' – ' || r.type_honoraire || ' – ' || r.montant::text || ' FCFA',
      'tache', _assignee, 'normale', 'a_faire', now(), now() + INTERVAL '7 days', r.id);
  END LOOP;
END $function$;