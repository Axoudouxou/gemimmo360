CREATE OR REPLACE FUNCTION public.guard_travaux_validation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _flag text := current_setting('app.travaux_validation', true);
BEGIN
  IF COALESCE(_flag,'') = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.statut IN ('a_valider','valide','refuse') THEN
      RAISE EXCEPTION 'Ce statut ne s''obtient que par le circuit de validation (Soumettre / Valider / Refuser)';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut AND (NEW.statut IN ('a_valider','valide','refuse') OR OLD.statut = 'a_valider') THEN
    RAISE EXCEPTION 'Ce statut ne s''obtient que par le circuit de validation (Soumettre / Valider / Refuser)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_travaux_validation BEFORE INSERT OR UPDATE OF statut ON public.travaux FOR EACH ROW EXECUTE FUNCTION public.guard_travaux_validation();

CREATE OR REPLACE FUNCTION public.soumettre_travaux_validation(_travaux_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.travaux%ROWTYPE; _bien text; _dir uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'technique') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')) THEN
    RAISE EXCEPTION 'Votre profil ne peut pas soumettre ce travail';
  END IF;
  SELECT * INTO _t FROM public.travaux WHERE id = _travaux_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Travail introuvable'; END IF;
  IF _t.statut NOT IN ('a_qualifier','planifie') THEN RAISE EXCEPTION 'Ce travail ne peut pas être soumis dans son statut actuel'; END IF;
  IF _t.budget_prevu IS NULL THEN RAISE EXCEPTION 'Budget prévu requis'; END IF;
  PERFORM set_config('app.travaux_validation','on',true);
  UPDATE public.travaux SET statut = 'a_valider' WHERE id = _travaux_id;
  PERFORM set_config('app.travaux_validation','off',true);
  SELECT titre INTO _bien FROM public.biens WHERE id = _t.bien_id;
  SELECT id INTO _dir FROM public.profiles WHERE role = 'direction' ORDER BY created_at LIMIT 1;
  INSERT INTO public.activites(titre,type_activite,date_debut,priorite,statut,assigne_a,created_by,travaux_id,bien_id)
  VALUES ('Validation devis – '||_t.titre||' – '||COALESCE(_bien,'—')||' – '||COALESCE(to_char(_t.budget_prevu,'FM999G999G999')||' FCFA','—'),
          'tache', now(), 'urgente', 'a_faire', COALESCE(_dir, auth.uid()), auth.uid(), _t.id, _t.bien_id);
END $$;

CREATE OR REPLACE FUNCTION public.decider_travaux(_travaux_id uuid, _decision text, _motif text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.travaux%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(),'direction') THEN RAISE EXCEPTION 'Seule la Direction peut valider ou refuser'; END IF;
  IF _decision NOT IN ('valide','refuse') THEN RAISE EXCEPTION 'Décision invalide'; END IF;
  IF _decision = 'refuse' AND COALESCE(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Le motif du refus est obligatoire'; END IF;
  SELECT * INTO _t FROM public.travaux WHERE id = _travaux_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Travail introuvable'; END IF;
  IF _t.statut <> 'a_valider' THEN RAISE EXCEPTION 'Ce travail n''est pas en attente de validation'; END IF;
  PERFORM set_config('app.travaux_validation','on',true);
  UPDATE public.travaux SET statut = _decision, motif_refus = CASE WHEN _decision = 'refuse' THEN trim(_motif) ELSE NULL END WHERE id = _travaux_id;
  PERFORM set_config('app.travaux_validation','off',true);
  UPDATE public.activites SET statut = 'terminee', updated_at = now()
   WHERE travaux_id = _travaux_id AND titre LIKE 'Validation devis – %' AND statut IN ('a_faire','en_cours');
END $$;

REVOKE EXECUTE ON FUNCTION public.soumettre_travaux_validation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decider_travaux(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soumettre_travaux_validation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decider_travaux(uuid,text,text) TO authenticated;