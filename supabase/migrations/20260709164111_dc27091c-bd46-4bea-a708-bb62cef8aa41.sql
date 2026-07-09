DROP POLICY IF EXISTS reclamations_all_non_recouvrement ON public.reclamations;
DROP POLICY IF EXISTS travaux_all_non_recouvrement ON public.travaux;

CREATE POLICY reclamations_all_except_recouvrement ON public.reclamations
FOR ALL TO authenticated
USING (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'))
WITH CHECK (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'));

CREATE POLICY travaux_all_except_recouvrement ON public.travaux
FOR ALL TO authenticated
USING (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'))
WITH CHECK (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'));