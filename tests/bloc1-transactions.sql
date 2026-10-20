-- All fixtures and successful operations are rolled back; no production rows are changed.
BEGIN;
SELECT set_config('request.jwt.claim.sub','acba4cca-b17c-4478-94fd-8c6fffeadfbc',true);
DO $$
DECLARE _bien uuid; _lot uuid; _contact uuid; _contrat uuid; _e1 uuid; _e2 uuid; _e3 uuid; _payment uuid; _before integer; _after integer; _q jsonb; _expected jsonb;
BEGIN
 INSERT INTO public.biens(titre,gestionnaire_id) VALUES('TEST BLOC1 rollback','acba4cca-b17c-4478-94fd-8c6fffeadfbc') RETURNING id INTO _bien;
 INSERT INTO public.lots(bien_id,label,statut) VALUES(_bien,'TEST','vacant') RETURNING id INTO _lot;
 INSERT INTO public.contacts(nom,type_contact,gestionnaire_id) VALUES('TEST BLOC1','prospect','acba4cca-b17c-4478-94fd-8c6fffeadfbc') RETURNING id INTO _contact;
 _contrat:=public.creer_contrat_atomique(jsonb_build_object('lot_id',_lot,'locataire_id',_contact,'statut','actif','date_debut','2026-10-01','loyer_mensuel',100000));
 IF (SELECT statut FROM public.lots WHERE id=_lot)<>'loue' OR (SELECT type_contact FROM public.contacts WHERE id=_contact)<>'locataire' THEN RAISE EXCEPTION 'Contract side effects missing'; END IF;
 INSERT INTO public.echeances(contrat_id,periode,date_echeance,montant_du) VALUES(_contrat,'2026-10-01','2026-10-10',100000) RETURNING id INTO _e1;
 INSERT INTO public.echeances(contrat_id,periode,date_echeance,montant_du) VALUES(_contrat,'2026-11-01','2026-11-10',100000) RETURNING id INTO _e2;
 SELECT count(*) INTO _before FROM public.paiements WHERE contrat_id=_contrat;
 BEGIN
  PERFORM public.enregistrer_paiement_atomique(jsonb_build_object('contrat_id',_contrat,'montant',200000,'date_paiement','2026-10-20','moyen_paiement','especes','affectations',jsonb_build_array(jsonb_build_object('echeance_id',_e1,'montant',150000))));
  RAISE EXCEPTION 'Expected payment failure not raised' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 SELECT count(*) INTO _after FROM public.paiements WHERE contrat_id=_contrat;
 IF _after<>_before THEN RAISE EXCEPTION 'Failed allocation left payment behind'; END IF;
 _payment:=public.enregistrer_paiement_atomique(jsonb_build_object('contrat_id',_contrat,'montant',100000,'date_paiement','2026-10-20','moyen_paiement','especes','affectations',jsonb_build_array(jsonb_build_object('echeance_id',_e1,'montant',100000))));
 IF (SELECT montant_affecte FROM public.echeances WHERE id=_e1)<>100000 THEN RAISE EXCEPTION 'Allocation not read back'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'echeance_id',echeance_id,'montant',montant)) INTO _expected FROM public.affectations WHERE paiement_id=_payment;
 PERFORM public.reaffecter_paiement_atomique(jsonb_build_object('paiement_id',_payment,'attendues',_expected,'affectations',jsonb_build_array(jsonb_build_object('echeance_id',_e1,'montant',0),jsonb_build_object('echeance_id',_e2,'montant',100000))));
 IF (SELECT montant_affecte FROM public.echeances WHERE id=_e1)<>0 OR (SELECT montant_affecte FROM public.echeances WHERE id=_e2)<>100000 THEN RAISE EXCEPTION 'Reallocation incorrect'; END IF;
 _q:=public.generer_quittances_atomique(jsonb_build_object('contrat_id',_contrat,'periodes',jsonb_build_array('2026-10-01','2026-11-01'),'montant_mois',100000,'date_paiement','2026-10-20','moyen_paiement','especes','mode_reglement','Espèces','locataire','TEST','bien','TEST','lot','TEST'));
 IF jsonb_array_length(_q)<>2 THEN RAISE EXCEPTION 'Expected 2 receipts'; END IF;
 SELECT count(*) INTO _before FROM public.paiements WHERE contrat_id=_contrat;
 PERFORM public.generer_quittances_atomique(jsonb_build_object('contrat_id',_contrat,'periodes',jsonb_build_array('2026-10-01','2026-11-01'),'montant_mois',100000,'date_paiement','2026-10-20','moyen_paiement','especes','mode_reglement','Espèces','locataire','TEST','bien','TEST','lot','TEST'));
 IF (SELECT count(*) FROM public.paiements WHERE contrat_id=_contrat)<>_before THEN RAISE EXCEPTION 'Receipt reissue duplicated payment'; END IF;
 INSERT INTO public.echeances(contrat_id,periode,date_echeance,montant_du) VALUES(_contrat,'2026-12-01','2026-12-10',100000) RETURNING id INTO _e3;
 PERFORM public.enregistrer_paiement_atomique(jsonb_build_object('contrat_id',_contrat,'montant',40000,'date_paiement','2026-12-05','moyen_paiement','especes','affectations',jsonb_build_array(jsonb_build_object('echeance_id',_e3,'montant',40000))));
 PERFORM public.generer_quittances_atomique(jsonb_build_object('contrat_id',_contrat,'periodes',jsonb_build_array('2026-12-01'),'montant_mois',100000,'date_paiement','2026-12-10','moyen_paiement','especes'));
 IF (SELECT sum(montant) FROM public.paiements WHERE contrat_id=_contrat AND date_paiement='2026-12-10')<>60000 THEN RAISE EXCEPTION 'Partial receipt must collect only remaining 60000'; END IF;
 SELECT count(*) INTO _before FROM public.echeances WHERE contrat_id=_contrat;
 BEGIN
  PERFORM public.generer_quittances_atomique(jsonb_build_object('contrat_id',_contrat,'periodes',jsonb_build_array('2027-01-01'),'montant_mois',110000,'penalite_mois',10000,'date_paiement','2027-01-10','moyen_paiement','especes'));
  RAISE EXCEPTION 'Penalty before 11 should fail' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE; WHEN OTHERS THEN NULL; END;
 IF (SELECT count(*) FROM public.echeances WHERE contrat_id=_contrat)<>_before THEN RAISE EXCEPTION 'Failed receipt left a period behind'; END IF;
 PERFORM public.terminer_bail_atomique(jsonb_build_object('contrat_id',_contrat,'date_fin','2026-10-20'));
 IF (SELECT count(*) FROM public.activites WHERE contrat_id=_contrat)<>2 OR (SELECT statut FROM public.contrats WHERE id=_contrat)<>'resilie' THEN RAISE EXCEPTION 'Lease termination incomplete'; END IF;
 PERFORM public.terminer_bail_atomique(jsonb_build_object('contrat_id',_contrat,'date_fin','2026-10-20'));
 IF (SELECT count(*) FROM public.activites WHERE contrat_id=_contrat)<>2 THEN RAISE EXCEPTION 'Duplicate termination tasks'; END IF;
 RAISE NOTICE 'PASS: contract, payment rollback, allocations, reallocation, receipts/reissue, termination';
END $$;
ROLLBACK;