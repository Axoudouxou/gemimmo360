CREATE OR REPLACE FUNCTION public.generer_quittances_atomique(_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _contrat uuid:=(_payload->>'contrat_id')::uuid; _a jsonb; _e public.echeances%ROWTYPE; _q public.quittances%ROWTYPE; _p uuid; _m numeric:=(_payload->>'montant_mois')::numeric; _penalite numeric:=coalesce((_payload->>'penalite_mois')::numeric,0); _reste numeric; _total numeric:=0; _lignes jsonb:='[]'::jsonb; _result jsonb:='[]'::jsonb; _periode date; _date date:=(_payload->>'date_paiement')::date;
BEGIN
 IF _uid IS NULL OR NOT (has_role(_uid,'admin') OR has_role(_uid,'direction') OR has_role(_uid,'recouvrement') OR has_role(_uid,'gestion_locative')) THEN RAISE EXCEPTION 'Votre profil ne peut pas émettre de quittance'; END IF;
 PERFORM 1 FROM public.contrats WHERE id=_contrat FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
 IF _m IS NULL OR _m<=0 OR _date IS NULL THEN RAISE EXCEPTION 'Montant positif et date de paiement obligatoires'; END IF;
 IF _penalite<0 OR _penalite>=_m THEN RAISE EXCEPTION 'Pénalité invalide'; END IF;
 IF jsonb_typeof(_payload->'periodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Périodes obligatoires'; END IF;
 IF jsonb_array_length(_payload->'periodes')=0 THEN RAISE EXCEPTION 'Périodes obligatoires'; END IF;
 IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(_payload->'periodes')) THEN RAISE EXCEPTION 'Une période ne peut être sélectionnée deux fois'; END IF;
 FOR _a IN SELECT value FROM jsonb_array_elements(_payload->'periodes') ORDER BY value LOOP
  _periode:=(_a #>> '{}')::date;
  IF _periode IS NULL OR extract(day FROM _periode)<>1 THEN RAISE EXCEPTION 'Chaque période doit commencer le premier du mois'; END IF;
  IF _penalite>0 AND _date<=_periode+9 THEN RAISE EXCEPTION 'La pénalité ne peut être appliquée avant le 11 du mois de la période %',_periode; END IF;
  SELECT * INTO _e FROM public.echeances WHERE contrat_id=_contrat AND periode=_periode FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO public.echeances(contrat_id,periode,date_echeance,montant_du,statut,etape_traitement,service_en_charge,created_by) VALUES(_contrat,_periode,_periode+9,_m,'impaye','recouvrement','recouvrement',_uid) RETURNING * INTO _e;
  ELSIF _penalite>0 AND _e.montant_du<>_m AND _e.montant_affecte<_e.montant_du THEN
   RAISE EXCEPTION 'La pénalité ne correspond pas au montant de l’impayé enregistré pour %. Corrigez cet impayé ou décochez la pénalité avant de générer la quittance',_periode;
  END IF;
  _reste:=greatest(0,_e.montant_du-coalesce(_e.montant_affecte,0));
  IF _reste>_m THEN RAISE EXCEPTION 'Le montant ne solde pas la période % : reste dû %',_periode,_reste; END IF;
  _total:=_total+_reste;
  _lignes:=_lignes||jsonb_build_array(jsonb_build_object('id',_e.id,'reste',_reste));
 END LOOP;
 IF _total>0 THEN
  INSERT INTO public.paiements(contrat_id,montant,date_paiement,moyen_paiement,reference,notes,created_by) VALUES(_contrat,_total,_date,_payload->>'moyen_paiement',nullif(_payload->>'reference',''),_payload->>'notes',_uid) RETURNING id INTO _p;
  FOR _a IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
   IF (_a->>'reste')::numeric>0 THEN INSERT INTO public.affectations(paiement_id,echeance_id,montant,mode,created_by) VALUES(_p,(_a->>'id')::uuid,(_a->>'reste')::numeric,'manuel',_uid); END IF;
  END LOOP;
 END IF;
 FOR _a IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
  SELECT * INTO _q FROM public.emettre_quittance((_a->>'id')::uuid,_date,_payload->>'mode_reglement',_payload->>'locataire',_payload->>'bien',_payload->>'lot');
  _result:=_result||jsonb_build_array(to_jsonb(_q));
 END LOOP;
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.generer_quittances_atomique(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generer_quittances_atomique(jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_transaction_juridique() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF public.has_role(auth.uid(),'juridique') AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'commercial')) AND (to_jsonb(NEW)-ARRAY['statut_opportunite','notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['statut_opportunite','notes','updated_at']) THEN RAISE EXCEPTION 'Juridique : seuls le statut et les notes peuvent être modifiés'; END IF;
 RETURN NEW;
END $$;