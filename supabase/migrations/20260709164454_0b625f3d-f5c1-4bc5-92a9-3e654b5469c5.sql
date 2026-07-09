DROP POLICY IF EXISTS edl_all_non_recouvrement ON public.etats_des_lieux;
CREATE POLICY edl_all_except_recouvrement ON public.etats_des_lieux
FOR ALL TO authenticated
USING (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'))
WITH CHECK (NOT has_role(auth.uid(), 'recouvrement') AND NOT has_role(auth.uid(), 'en_attente'));