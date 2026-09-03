DROP POLICY IF EXISTS biens_select_own_portfolio ON public.biens;
DROP POLICY IF EXISTS biens_update_own_portfolio ON public.biens;

CREATE POLICY biens_select_commercial_all ON public.biens
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'commercial')
  OR (has_role(auth.uid(), 'gestion_locative') AND gestionnaire_id = auth.uid())
);

CREATE POLICY biens_update_commercial_all ON public.biens
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'commercial')
  OR (has_role(auth.uid(), 'gestion_locative') AND gestionnaire_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'commercial')
  OR (has_role(auth.uid(), 'gestion_locative') AND gestionnaire_id = auth.uid())
);