-- 1. Travaux statuts
UPDATE public.travaux SET statut = 'a_valider' WHERE statut = 'en_attente_validation';
ALTER TABLE public.travaux DROP CONSTRAINT IF EXISTS travaux_statut_check;
ALTER TABLE public.travaux ADD CONSTRAINT travaux_statut_check CHECK (statut = ANY (ARRAY['a_qualifier','a_valider','valide','planifie','en_cours','termine','refuse','annule']));
ALTER TABLE public.travaux ALTER COLUMN statut SET DEFAULT 'a_qualifier';

-- 2. RLS travaux : l'assigné a les pleins droits
DROP POLICY IF EXISTS travaux_update ON public.travaux;
CREATE POLICY travaux_update ON public.travaux FOR UPDATE TO authenticated
USING (
  (NOT has_role(auth.uid(),'recouvrement')) AND (NOT has_role(auth.uid(),'en_attente'))
  AND (created_by = auth.uid() OR assigne_a = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction') OR has_role(auth.uid(),'technique'))
)
WITH CHECK (
  (NOT has_role(auth.uid(),'recouvrement')) AND (NOT has_role(auth.uid(),'en_attente'))
  AND (created_by = auth.uid() OR assigne_a = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction') OR has_role(auth.uid(),'technique'))
);

-- 3. Trigger travaux : assigné = pleins droits
CREATE OR REPLACE FUNCTION public.restrict_technique_travaux_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid
     OR OLD.assigne_a = uid
     OR public.has_role(uid,'admin')
     OR public.has_role(uid,'direction')
     OR public.has_role(uid,'juridique')
     OR public.is_christelle_kouassi() THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.origine IS DISTINCT FROM OLD.origine
       OR NEW.charge_financiere IS DISTINCT FROM OLD.charge_financiere
       OR NEW.etat_des_lieux_id IS DISTINCT FROM OLD.etat_des_lieux_id THEN
      RAISE EXCEPTION 'Le profil technique peut uniquement changer statut, assignation, dates, budget et commentaires.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur, l''assigné ou l''équipe technique peut modifier ces travaux.';
END;
$$;

-- 4. Trigger réclamations : assigné = pleins droits
CREATE OR REPLACE FUNCTION public.restrict_technique_reclamation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid OR OLD.assigne_a = uid OR public.has_role(uid,'admin') OR public.has_role(uid,'direction') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.locataire_id IS DISTINCT FROM OLD.locataire_id THEN
      RAISE EXCEPTION 'Vous pouvez uniquement changer statut, priorité, assignation, prestataire, catégorie, solution et documents.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur, l''assigné ou l''équipe technique peut modifier cette réclamation.';
END;
$$;

-- 5. Trigger activités : assigné = pleins droits
CREATE OR REPLACE FUNCTION public.restrict_assignee_activite_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NEW;
END;
$$;