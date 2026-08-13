DROP POLICY IF EXISTS recl_update ON public.reclamations;
CREATE POLICY recl_update ON public.reclamations
FOR UPDATE TO authenticated
USING (
  (NOT has_role(auth.uid(), 'recouvrement')) AND (NOT has_role(auth.uid(), 'en_attente'))
  AND (created_by = auth.uid() OR assigne_a = auth.uid()
       OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
       OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'juridique'))
)
WITH CHECK (
  (NOT has_role(auth.uid(), 'recouvrement')) AND (NOT has_role(auth.uid(), 'en_attente'))
  AND (created_by = auth.uid() OR assigne_a = auth.uid()
       OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
       OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'juridique'))
);

CREATE OR REPLACE FUNCTION public.restrict_technique_reclamation_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid OR public.has_role(uid,'admin') OR public.has_role(uid,'direction') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') OR OLD.assigne_a = uid THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.locataire_id IS DISTINCT FROM OLD.locataire_id THEN
      RAISE EXCEPTION 'Vous pouvez uniquement changer statut, priorité, assignation, prestataire, catégorie, solution et documents.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur, l''assigné ou l''équipe technique peut modifier cette réclamation.';
END $$;