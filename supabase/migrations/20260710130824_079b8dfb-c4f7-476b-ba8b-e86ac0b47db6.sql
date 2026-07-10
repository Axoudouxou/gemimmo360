
-- ============ 1. EDL: lot_id required, contrat_id optional ============
ALTER TABLE public.etats_des_lieux ADD COLUMN lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE;
UPDATE public.etats_des_lieux e SET lot_id = c.lot_id FROM public.contrats c WHERE e.contrat_id = c.id;
ALTER TABLE public.etats_des_lieux ALTER COLUMN lot_id SET NOT NULL;
ALTER TABLE public.etats_des_lieux ALTER COLUMN contrat_id DROP NOT NULL;

-- ============ 2. travaux / reclamations: nouvelles colonnes ============
ALTER TABLE public.travaux
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigne_a uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prestataire_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_travaux_updated_at ON public.travaux;
CREATE TRIGGER trg_travaux_updated_at BEFORE UPDATE ON public.travaux
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reclamations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigne_a uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prestataire_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_reclamations_updated_at ON public.reclamations;
CREATE TRIGGER trg_reclamations_updated_at BEFORE UPDATE ON public.reclamations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. Tables de commentaires ============
CREATE TABLE public.travaux_commentaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  travaux_id uuid NOT NULL REFERENCES public.travaux(id) ON DELETE CASCADE,
  auteur uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travaux_commentaires TO authenticated;
GRANT ALL ON public.travaux_commentaires TO service_role;
ALTER TABLE public.travaux_commentaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY travaux_comm_read ON public.travaux_commentaires FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY travaux_comm_insert ON public.travaux_commentaires FOR INSERT TO authenticated
  WITH CHECK (auteur = auth.uid() AND NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY travaux_comm_delete ON public.travaux_commentaires FOR DELETE TO authenticated
  USING (auteur = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.reclamations_commentaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamation_id uuid NOT NULL REFERENCES public.reclamations(id) ON DELETE CASCADE,
  auteur uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclamations_commentaires TO authenticated;
GRANT ALL ON public.reclamations_commentaires TO service_role;
ALTER TABLE public.reclamations_commentaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY recl_comm_read ON public.reclamations_commentaires FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY recl_comm_insert ON public.reclamations_commentaires FOR INSERT TO authenticated
  WITH CHECK (auteur = auth.uid() AND NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY recl_comm_delete ON public.reclamations_commentaires FOR DELETE TO authenticated
  USING (auteur = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ 4. Séparer SELECT / UPDATE / DELETE sur travaux et reclamations ============
DROP POLICY IF EXISTS travaux_all_except_recouvrement ON public.travaux;
CREATE POLICY travaux_select ON public.travaux FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY travaux_insert ON public.travaux FOR INSERT TO authenticated
  WITH CHECK (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY travaux_update ON public.travaux FOR UPDATE TO authenticated
  USING (
    NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente')
    AND (created_by = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'direction')
         OR public.has_role(auth.uid(),'technique'))
  )
  WITH CHECK (
    NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente')
    AND (created_by = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'direction')
         OR public.has_role(auth.uid(),'technique'))
  );
CREATE POLICY travaux_delete ON public.travaux FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

CREATE OR REPLACE FUNCTION public.restrict_technique_travaux_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid OR public.has_role(uid,'admin') OR public.has_role(uid,'direction') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.origine IS DISTINCT FROM OLD.origine
       OR NEW.charge_financiere IS DISTINCT FROM OLD.charge_financiere
       OR NEW.etat_des_lieux_id IS DISTINCT FROM OLD.etat_des_lieux_id THEN
      RAISE EXCEPTION 'Le profil technique peut uniquement changer statut, assignation, prestataire, dates, budget et commentaires.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur ou l''équipe technique peut modifier ces travaux.';
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_travaux_update ON public.travaux;
CREATE TRIGGER trg_restrict_travaux_update BEFORE UPDATE ON public.travaux
  FOR EACH ROW EXECUTE FUNCTION public.restrict_technique_travaux_update();

DROP POLICY IF EXISTS reclamations_all_except_recouvrement ON public.reclamations;
CREATE POLICY recl_select ON public.reclamations FOR SELECT TO authenticated
  USING (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY recl_insert ON public.reclamations FOR INSERT TO authenticated
  WITH CHECK (NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY recl_update ON public.reclamations FOR UPDATE TO authenticated
  USING (
    NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente')
    AND (created_by = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'direction')
         OR public.has_role(auth.uid(),'technique'))
  )
  WITH CHECK (
    NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente')
    AND (created_by = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'direction')
         OR public.has_role(auth.uid(),'technique'))
  );
CREATE POLICY recl_delete ON public.reclamations FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

CREATE OR REPLACE FUNCTION public.restrict_technique_reclamation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid OR public.has_role(uid,'admin') OR public.has_role(uid,'direction') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.locataire_id IS DISTINCT FROM OLD.locataire_id THEN
      RAISE EXCEPTION 'Le profil technique peut uniquement changer statut, priorité, assignation et prestataire.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur ou l''équipe technique peut modifier cette réclamation.';
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_recl_update ON public.reclamations;
CREATE TRIGGER trg_restrict_recl_update BEFORE UPDATE ON public.reclamations
  FOR EACH ROW EXECUTE FUNCTION public.restrict_technique_reclamation_update();
