DROP POLICY IF EXISTS lots_insert ON public.lots;
CREATE POLICY lots_insert ON public.lots FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction')
  OR has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'technico-commercial')
);

DROP POLICY IF EXISTS lots_select_own_portfolio ON public.lots;
CREATE POLICY lots_select_own_portfolio ON public.lots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'technico-commercial')
);

DROP POLICY IF EXISTS lots_update_own_portfolio ON public.lots;
CREATE POLICY lots_update_own_portfolio ON public.lots FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'technico-commercial')
)
WITH CHECK (
  has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'technico-commercial')
);