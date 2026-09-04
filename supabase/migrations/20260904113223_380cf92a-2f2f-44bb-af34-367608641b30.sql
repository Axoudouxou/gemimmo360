-- ============ ECHEANCES ============
CREATE TABLE public.echeances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  periode date NOT NULL,
  date_echeance date NOT NULL,
  montant_du numeric NOT NULL DEFAULT 0,
  montant_affecte numeric NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'impaye' CHECK (statut IN ('impaye','partiel','solde')),
  etape_traitement text NOT NULL DEFAULT 'recouvrement',
  service_en_charge text NOT NULL DEFAULT 'recouvrement',
  date_derniere_relance date,
  date_mise_en_demeure date,
  date_acte_commissaire date,
  date_assignation date,
  notes text,
  impaye_origine_id uuid REFERENCES public.impayes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT echeances_unique_contrat_periode UNIQUE (contrat_id, periode),
  CONSTRAINT echeances_montant_du_positif CHECK (montant_du >= 0)
);
CREATE INDEX idx_echeances_contrat ON public.echeances(contrat_id);
CREATE INDEX idx_echeances_periode ON public.echeances(periode);
CREATE INDEX idx_echeances_statut ON public.echeances(statut);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.echeances TO authenticated;
GRANT ALL ON public.echeances TO service_role;
ALTER TABLE public.echeances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "echeances_select" ON public.echeances FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'en_attente'));
CREATE POLICY "echeances_insert" ON public.echeances FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'));
CREATE POLICY "echeances_update" ON public.echeances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'));
CREATE POLICY "echeances_delete" ON public.echeances FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

CREATE TRIGGER trg_echeances_updated_at BEFORE UPDATE ON public.echeances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAIEMENTS ============
CREATE TABLE public.paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  date_paiement date NOT NULL DEFAULT CURRENT_DATE,
  montant numeric NOT NULL CHECK (montant > 0),
  moyen_paiement text NOT NULL DEFAULT 'especes'
    CHECK (moyen_paiement IN ('especes','virement','cheque','mobile_money','autre')),
  reference text,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_paiements_contrat ON public.paiements(contrat_id);
CREATE INDEX idx_paiements_date ON public.paiements(date_paiement);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paiements TO authenticated;
GRANT ALL ON public.paiements TO service_role;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paiements_select" ON public.paiements FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'en_attente'));
CREATE POLICY "paiements_insert" ON public.paiements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'));
CREATE POLICY "paiements_update" ON public.paiements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'));
CREATE POLICY "paiements_delete" ON public.paiements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

CREATE TRIGGER trg_paiements_updated_at BEFORE UPDATE ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AFFECTATIONS ============
CREATE TABLE public.affectations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_id uuid NOT NULL REFERENCES public.paiements(id) ON DELETE CASCADE,
  echeance_id uuid NOT NULL REFERENCES public.echeances(id) ON DELETE CASCADE,
  montant numeric NOT NULL CHECK (montant > 0),
  mode text NOT NULL DEFAULT 'auto_fifo' CHECK (mode IN ('auto_fifo','manuel','migration')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affectations_unique UNIQUE (paiement_id, echeance_id)
);
CREATE INDEX idx_affectations_paiement ON public.affectations(paiement_id);
CREATE INDEX idx_affectations_echeance ON public.affectations(echeance_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.affectations TO authenticated;
GRANT ALL ON public.affectations TO service_role;
ALTER TABLE public.affectations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affectations_select" ON public.affectations FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'en_attente'));
CREATE POLICY "affectations_insert" ON public.affectations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial') OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique'));
CREATE POLICY "affectations_update_admin" ON public.affectations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));
CREATE POLICY "affectations_delete_admin" ON public.affectations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

-- ============ HISTORIQUE DES AFFECTATIONS ============
CREATE TABLE public.affectations_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affectation_id uuid,
  paiement_id uuid,
  echeance_id uuid,
  action text NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text,
  auteur uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_affectations_hist_paiement ON public.affectations_historique(paiement_id);
CREATE INDEX idx_affectations_hist_echeance ON public.affectations_historique(echeance_id);

GRANT SELECT ON public.affectations_historique TO authenticated;
GRANT ALL ON public.affectations_historique TO service_role;
ALTER TABLE public.affectations_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affectations_hist_select" ON public.affectations_historique FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(), 'en_attente'));

-- ============ RECALCUL AUTOMATIQUE + CONTROLES ============
CREATE OR REPLACE FUNCTION public.recompute_echeance(_echeance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _total numeric; _du numeric;
BEGIN
  SELECT COALESCE(SUM(a.montant),0) INTO _total FROM public.affectations a WHERE a.echeance_id = _echeance_id;
  SELECT e.montant_du INTO _du FROM public.echeances e WHERE e.id = _echeance_id;
  IF _du IS NULL THEN RETURN; END IF;
  UPDATE public.echeances SET
    montant_affecte = _total,
    statut = CASE WHEN _du > 0 AND _total >= _du THEN 'solde'
                  WHEN _total > 0 THEN 'partiel'
                  WHEN _du = 0 THEN 'solde'
                  ELSE 'impaye' END
  WHERE id = _echeance_id;
END $$;

CREATE OR REPLACE FUNCTION public.affectation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sum_p numeric; _montant_p numeric; _sum_e numeric; _du numeric; _pid uuid; _eid uuid;
BEGIN
  _pid := COALESCE(NEW.paiement_id, OLD.paiement_id);
  _eid := COALESCE(NEW.echeance_id, OLD.echeance_id);

  IF TG_OP <> 'DELETE' THEN
    SELECT COALESCE(SUM(montant),0) INTO _sum_p FROM public.affectations
      WHERE paiement_id = NEW.paiement_id AND id <> NEW.id;
    SELECT montant INTO _montant_p FROM public.paiements WHERE id = NEW.paiement_id;
    IF _sum_p + NEW.montant > _montant_p + 0.001 THEN
      RAISE EXCEPTION 'Le total affecté (%) dépasse le montant du paiement (%)', _sum_p + NEW.montant, _montant_p;
    END IF;

    SELECT COALESCE(SUM(montant),0) INTO _sum_e FROM public.affectations
      WHERE echeance_id = NEW.echeance_id AND id <> NEW.id;
    SELECT montant_du INTO _du FROM public.echeances WHERE id = NEW.echeance_id;
    IF _sum_e + NEW.montant > _du + 0.001 THEN
      RAISE EXCEPTION 'Le total affecté (%) dépasse le montant dû de l''échéance (%)', _sum_e + NEW.montant, _du;
    END IF;
  END IF;

  INSERT INTO public.affectations_historique(affectation_id, paiement_id, echeance_id, action, ancienne_valeur, nouvelle_valeur, auteur)
  VALUES (
    COALESCE(NEW.id, OLD.id), _pid, _eid,
    lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.montant::text END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.montant::text END,
    auth.uid()
  );

  PERFORM public.recompute_echeance(_eid);
  IF TG_OP = 'UPDATE' AND NEW.echeance_id IS DISTINCT FROM OLD.echeance_id THEN
    PERFORM public.recompute_echeance(OLD.echeance_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_affectation_guard
  AFTER INSERT OR UPDATE OR DELETE ON public.affectations
  FOR EACH ROW EXECUTE FUNCTION public.affectation_guard();

-- Recalcul lorsque le montant dû d'une échéance change
CREATE OR REPLACE FUNCTION public.echeance_recompute_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.montant_du IS DISTINCT FROM OLD.montant_du THEN
    PERFORM public.recompute_echeance(NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_echeance_recompute
  AFTER UPDATE ON public.echeances
  FOR EACH ROW EXECUTE FUNCTION public.echeance_recompute_on_change();

-- ============ AFFECTATION FIFO ============
CREATE OR REPLACE FUNCTION public.affecter_paiement_fifo(_paiement_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _reste numeric; _contrat uuid; r RECORD; _part numeric;
BEGIN
  SELECT montant, contrat_id INTO _reste, _contrat FROM public.paiements WHERE id = _paiement_id;
  IF _reste IS NULL THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  _reste := _reste - COALESCE((SELECT SUM(montant) FROM public.affectations WHERE paiement_id = _paiement_id), 0);

  FOR r IN
    SELECT id, montant_du - montant_affecte AS restant
    FROM public.echeances
    WHERE contrat_id = _contrat AND statut <> 'solde' AND montant_du > montant_affecte
    ORDER BY periode ASC
  LOOP
    EXIT WHEN _reste <= 0;
    _part := LEAST(_reste, r.restant);
    INSERT INTO public.affectations(paiement_id, echeance_id, montant, mode, created_by)
    VALUES (_paiement_id, r.id, _part, 'auto_fifo', auth.uid())
    ON CONFLICT (paiement_id, echeance_id)
      DO UPDATE SET montant = public.affectations.montant + EXCLUDED.montant;
    _reste := _reste - _part;
  END LOOP;

  RETURN _reste;
END $$;

REVOKE EXECUTE ON FUNCTION public.recompute_echeance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.affecter_paiement_fifo(uuid) FROM anon;