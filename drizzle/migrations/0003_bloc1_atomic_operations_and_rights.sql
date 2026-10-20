CREATE OR REPLACE FUNCTION public.creer_contrat_atomique(_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _lot uuid:=(_payload->>'lot_id')::uuid; _loc uuid:=nullif(_payload->>'locataire_id','')::uuid; _ancien uuid; _id uuid; _n jsonb:=_payload->'nouveau_locataire';
BEGIN
 IF _uid IS NULL OR NOT (has_role(_uid,'admin') OR has_role(_uid,'direction') OR has_role(_uid,'juridique') OR has_role(_uid,'gestion_locative')) THEN RAISE EXCEPTION 'Votre profil ne peut pas créer de contrat'; END IF;
 PERFORM 1 FROM public.lots WHERE id=_lot FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Lot introuvable'; END IF;
 SELECT id INTO _ancien FROM public.contrats WHERE lot_id=_lot AND statut='actif' ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF _ancien IS NOT NULL AND _ancien IS DISTINCT FROM nullif(_payload->>'ancien_contrat_id','')::uuid THEN RAISE EXCEPTION 'Le contrat actif a changé. Rechargez et confirmez le remplacement'; END IF;
 IF _n IS NOT NULL AND _n <> 'null'::jsonb THEN
  IF nullif(trim(_n->>'nom'),'') IS NULL THEN RAISE EXCEPTION 'Le nom du locataire est obligatoire'; END IF;
  INSERT INTO public.contacts(nom,prenom,telephone,email,type_contact,type_entite,gestionnaire_id) VALUES(trim(_n->>'nom'),nullif(trim(_n->>'prenom'),''),nullif(trim(_n->>'telephone'),''),nullif(trim(_n->>'email'),''),'locataire',coalesce(_n->>'type_entite','personne'),_uid) RETURNING id INTO _loc;
 END IF;
 IF _loc IS NULL THEN RAISE EXCEPTION 'Le locataire est obligatoire'; END IF;
 PERFORM 1 FROM public.contacts WHERE id=_loc FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Locataire introuvable'; END IF;
 IF _ancien IS NOT NULL THEN UPDATE public.contrats SET statut='termine',date_fin=CURRENT_DATE WHERE id=_ancien; END IF;
 INSERT INTO public.contrats(lot_id,locataire_id,loyer_mensuel,depot_garantie,date_debut,statut,transaction_origine_id) VALUES(_lot,_loc,(_payload->>'loyer_mensuel')::numeric,(_payload->>'depot_garantie')::numeric,(_payload->>'date_debut')::date,coalesce(_payload->>'statut','actif'),nullif(_payload->>'transaction_origine_id','')::uuid) RETURNING id INTO _id;
 IF coalesce(_payload->>'statut','actif')='actif' THEN UPDATE public.lots SET statut='loue' WHERE id=_lot; END IF;
 UPDATE public.contacts SET type_contact='locataire' WHERE id=_loc AND type_contact='prospect';
 RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.enregistrer_paiement_atomique(_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _contrat uuid:=(_payload->>'contrat_id')::uuid; _id uuid; _a jsonb; _e public.echeances%ROWTYPE; _total numeric;
BEGIN
 IF _uid IS NULL OR NOT (has_role(_uid,'admin') OR has_role(_uid,'direction') OR has_role(_uid,'recouvrement') OR has_role(_uid,'gestion_locative')) THEN RAISE EXCEPTION 'Votre profil ne peut pas enregistrer de paiement'; END IF;
 PERFORM 1 FROM public.contrats WHERE id=_contrat FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
 IF coalesce((_payload->>'montant')::numeric,0)<=0 OR nullif(_payload->>'date_paiement','') IS NULL THEN RAISE EXCEPTION 'Montant positif et date de paiement obligatoires'; END IF;
 SELECT coalesce(sum((a->>'montant')::numeric),0) INTO _total FROM jsonb_array_elements(coalesce(_payload->'affectations','[]'::jsonb)) a;
 IF _total > (_payload->>'montant')::numeric THEN RAISE EXCEPTION 'Le total affecté dépasse le paiement'; END IF;
 INSERT INTO public.paiements(contrat_id,montant,date_paiement,moyen_paiement,reference,notes,created_by) VALUES(_contrat,(_payload->>'montant')::numeric,(_payload->>'date_paiement')::date,_payload->>'moyen_paiement',nullif(_payload->>'reference',''),nullif(_payload->>'notes',''),_uid) RETURNING id INTO _id;
 FOR _a IN SELECT value FROM jsonb_array_elements(coalesce(_payload->'affectations','[]'::jsonb)) ORDER BY value->>'echeance_id' LOOP
  SELECT * INTO _e FROM public.echeances WHERE id=(_a->>'echeance_id')::uuid FOR UPDATE;
  IF NOT FOUND OR _e.contrat_id<>_contrat THEN RAISE EXCEPTION 'Une échéance ne correspond pas au contrat'; END IF;
  IF (_a->>'montant')::numeric<=0 THEN RAISE EXCEPTION 'Chaque affectation doit être positive'; END IF;
  INSERT INTO public.affectations(paiement_id,echeance_id,montant,mode,created_by) VALUES(_id,_e.id,(_a->>'montant')::numeric,'manuel',_uid);
 END LOOP;
 RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.reaffecter_paiement_atomique(_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _p public.paiements%ROWTYPE; _a jsonb; _e public.echeances%ROWTYPE; _current jsonb; _aff public.affectations%ROWTYPE; _target numeric;
BEGIN
 IF _uid IS NULL OR NOT (has_role(_uid,'admin') OR has_role(_uid,'direction')) THEN RAISE EXCEPTION 'Votre profil ne peut pas réaffecter de paiement'; END IF;
 SELECT * INTO _p FROM public.paiements WHERE id=(_payload->>'paiement_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
 PERFORM 1 FROM public.contrats WHERE id=_p.contrat_id FOR UPDATE;
 SELECT * INTO _p FROM public.paiements WHERE id=_p.id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'echeance_id',echeance_id,'montant',montant) ORDER BY id),'[]'::jsonb) INTO _current FROM public.affectations WHERE paiement_id=_p.id;
 IF _current IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(_payload->'attendues')) THEN RAISE EXCEPTION 'Les affectations ont changé. Rechargez avant de modifier'; END IF;
 IF (SELECT coalesce(sum((value->>'montant')::numeric),0) FROM jsonb_array_elements(_payload->'affectations'))>_p.montant THEN RAISE EXCEPTION 'Le total affecté dépasse le paiement'; END IF;
 FOR _a IN SELECT value FROM jsonb_array_elements(_payload->'affectations') ORDER BY value->>'echeance_id' LOOP
  SELECT * INTO _e FROM public.echeances WHERE id=(_a->>'echeance_id')::uuid FOR UPDATE;
  IF NOT FOUND OR _e.contrat_id<>_p.contrat_id OR (_a->>'montant')::numeric<0 THEN RAISE EXCEPTION 'Affectation invalide pour ce contrat'; END IF;
 END LOOP;
 FOR _aff IN SELECT * FROM public.affectations WHERE paiement_id=_p.id LOOP
  SELECT (value->>'montant')::numeric INTO _target FROM jsonb_array_elements(_payload->'affectations') WHERE value->>'echeance_id'=_aff.echeance_id::text;
  _target:=coalesce(_target,0);
  IF _target=0 THEN DELETE FROM public.affectations WHERE id=_aff.id;
  ELSIF _target<_aff.montant THEN UPDATE public.affectations SET montant=_target WHERE id=_aff.id; END IF;
 END LOOP;
 FOR _a IN SELECT value FROM jsonb_array_elements(_payload->'affectations') LOOP
  _target:=(_a->>'montant')::numeric; IF _target<=0 THEN CONTINUE; END IF;
  SELECT * INTO _aff FROM public.affectations WHERE paiement_id=_p.id AND echeance_id=(_a->>'echeance_id')::uuid;
  IF FOUND THEN IF _aff.montant<>_target THEN UPDATE public.affectations SET montant=_target WHERE id=_aff.id; END IF;
  ELSE INSERT INTO public.affectations(paiement_id,echeance_id,montant,mode,created_by) VALUES(_p.id,(_a->>'echeance_id')::uuid,_target,'manuel',_uid); END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.generer_quittances_atomique(_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _contrat uuid:=(_payload->>'contrat_id')::uuid; _a jsonb; _e public.echeances%ROWTYPE; _q public.quittances%ROWTYPE; _p uuid; _m numeric:=(_payload->>'montant_mois')::numeric; _reste numeric; _total numeric:=0; _lignes jsonb:='[]'::jsonb; _result jsonb:='[]'::jsonb; _periode date;
BEGIN
 IF _uid IS NULL OR NOT (has_role(_uid,'admin') OR has_role(_uid,'direction') OR has_role(_uid,'recouvrement') OR has_role(_uid,'gestion_locative')) THEN RAISE EXCEPTION 'Votre profil ne peut pas émettre de quittance'; END IF;
 PERFORM 1 FROM public.contrats WHERE id=_contrat FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
 IF _m<=0 OR nullif(_payload->>'date_paiement','') IS NULL THEN RAISE EXCEPTION 'Montant positif et date de paiement obligatoires'; END IF;
 FOR _a IN SELECT value FROM jsonb_array_elements(_payload->'periodes') ORDER BY value LOOP
  _periode:=(_a #>> '{}')::date;
  SELECT * INTO _e FROM public.echeances WHERE contrat_id=_contrat AND periode=_periode FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.echeances(contrat_id,periode,date_echeance,montant_du,statut,etape_traitement,service_en_charge,created_by) VALUES(_contrat,_periode,_periode+9,_m,'impaye','recouvrement','recouvrement',_uid) RETURNING * INTO _e; END IF;
  _reste:=greatest(0,_e.montant_du-_e.montant_affecte);
  IF _reste>_m THEN RAISE EXCEPTION 'Le montant ne solde pas la période % : reste dû %',_periode,_reste; END IF;
  IF _reste>0 THEN _total:=_total+_m; END IF;
  _lignes:=_lignes||jsonb_build_array(jsonb_build_object('id',_e.id,'reste',_reste));
 END LOOP;
 IF _total>0 THEN
  INSERT INTO public.paiements(contrat_id,montant,date_paiement,moyen_paiement,reference,notes,created_by) VALUES(_contrat,_total,(_payload->>'date_paiement')::date,_payload->>'moyen_paiement',nullif(_payload->>'reference',''),_payload->>'notes',_uid) RETURNING id INTO _p;
  FOR _a IN SELECT value FROM jsonb_array_elements(_lignes) LOOP IF (_a->>'reste')::numeric>0 THEN INSERT INTO public.affectations(paiement_id,echeance_id,montant,mode,created_by) VALUES(_p,(_a->>'id')::uuid,(_a->>'reste')::numeric,'manuel',_uid); END IF; END LOOP;
 END IF;
 FOR _a IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
  SELECT * INTO _q FROM public.emettre_quittance((_a->>'id')::uuid,(_payload->>'date_paiement')::date,_payload->>'mode_reglement',_payload->>'locataire',_payload->>'bien',_payload->>'lot');
  _result:=_result||jsonb_build_array(to_jsonb(_q));
 END LOOP;
 RETURN _result;
END $$;
CREATE OR REPLACE FUNCTION public.terminer_bail_atomique(_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _uid uuid:=auth.uid(); _c public.contrats%ROWTYPE; _lot public.lots%ROWTYPE; _loc public.contacts%ROWTYPE; _bien public.biens%ROWTYPE; _tech uuid; _finance uuid; _fin date:=(_payload->>'date_fin')::date; _nom text; _lieu text;
BEGIN
 IF _uid IS NULL OR NOT public.is_staff_actif() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 SELECT * INTO _c FROM public.contrats WHERE id=(_payload->>'contrat_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
 SELECT * INTO _lot FROM public.lots WHERE id=_c.lot_id FOR UPDATE;
 SELECT * INTO _c FROM public.contrats WHERE id=_c.id FOR UPDATE;
 IF _c.statut='resilie' THEN RETURN jsonb_build_object('ok',true); END IF;
 IF _fin IS NULL THEN RAISE EXCEPTION 'Date de fin obligatoire'; END IF;
 SELECT * INTO _loc FROM public.contacts WHERE id=_c.locataire_id;
 SELECT * INTO _bien FROM public.biens WHERE id=_lot.bien_id;
 SELECT id INTO _tech FROM public.profiles WHERE role IN ('technique','technico_commercial') LIMIT 1;
 SELECT id INTO _finance FROM public.profiles WHERE role='recouvrement' LIMIT 1;
 IF _tech IS NULL OR _finance IS NULL THEN RAISE EXCEPTION 'Impossible de créer les tâches : un destinataire Technique et Finance est nécessaire'; END IF;
 _nom:=coalesce(_loc.nom,'locataire')||CASE WHEN _loc.type_entite='entreprise' OR _loc.prenom IS NULL THEN '' ELSE ' '||_loc.prenom END;
 _lieu:=coalesce(_bien.titre,'bien')||coalesce(' – '||_lot.label,'');
 UPDATE public.contrats SET statut='resilie',date_fin=_fin WHERE id=_c.id;
 UPDATE public.lots SET statut='vacant' WHERE id=_lot.id AND NOT EXISTS(SELECT 1 FROM public.contrats WHERE lot_id=_lot.id AND statut='actif');
 INSERT INTO public.activites(titre,type_activite,priorite,statut,date_debut,assigne_a,created_by,contrat_id,bien_id,lot_id) VALUES
 ('État des lieux de sortie – '||_nom||' – '||_lieu,'etat_des_lieux','urgente','a_faire',_fin,_tech,_uid,_c.id,_lot.bien_id,_lot.id),
 ('Décompte de sortie et remboursement caution – '||_nom||' – '||_lieu||' – Caution : '||coalesce(_c.depot_garantie::text||' FCFA','montant non renseigné'),'tache','normale','a_faire',_fin+45,_finance,_uid,_c.id,_lot.bien_id,_lot.id);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.creer_contrat_atomique(jsonb),public.enregistrer_paiement_atomique(jsonb),public.reaffecter_paiement_atomique(jsonb),public.generer_quittances_atomique(jsonb),public.terminer_bail_atomique(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.creer_contrat_atomique(jsonb),public.enregistrer_paiement_atomique(jsonb),public.reaffecter_paiement_atomique(jsonb),public.generer_quittances_atomique(jsonb),public.terminer_bail_atomique(jsonb) TO authenticated,service_role;
ALTER POLICY contrats_insert_staff ON public.contrats WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction') OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative'));
DROP POLICY IF EXISTS transactions_juridique_full ON public.transactions_commerciales;
CREATE POLICY transactions_juridique_select ON public.transactions_commerciales FOR SELECT TO authenticated USING(has_role(auth.uid(),'juridique'));
CREATE POLICY transactions_juridique_update ON public.transactions_commerciales FOR UPDATE TO authenticated USING(has_role(auth.uid(),'juridique')) WITH CHECK(has_role(auth.uid(),'juridique'));
CREATE OR REPLACE FUNCTION public.guard_transaction_juridique() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF public.has_role(auth.uid(),'juridique') AND (to_jsonb(NEW)-ARRAY['statut_opportunite','notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['statut_opportunite','notes','updated_at']) THEN RAISE EXCEPTION 'Juridique : seuls le statut et les notes peuvent être modifiés'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_transaction_juridique BEFORE UPDATE ON public.transactions_commerciales FOR EACH ROW EXECUTE FUNCTION public.guard_transaction_juridique();