DROP POLICY IF EXISTS echeances_insert ON public.echeances;
DROP POLICY IF EXISTS echeances_update ON public.echeances;
DROP POLICY IF EXISTS paiements_insert ON public.paiements;
DROP POLICY IF EXISTS paiements_update ON public.paiements;
DROP POLICY IF EXISTS affectations_insert ON public.affectations;

CREATE POLICY echeances_insert ON public.echeances FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'));
CREATE POLICY echeances_update ON public.echeances FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'));

CREATE POLICY paiements_insert ON public.paiements FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'));
CREATE POLICY paiements_update ON public.paiements FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'));

CREATE POLICY affectations_insert ON public.affectations FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative'));