DROP POLICY IF EXISTS charges_write_roles ON public.charges;
CREATE POLICY charges_write_roles ON public.charges FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'technico_commercial')
  OR has_role(auth.uid(), 'recouvrement') OR is_christelle_kouassi()
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'gestion_locative')
  OR has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'technico_commercial')
  OR has_role(auth.uid(), 'recouvrement') OR is_christelle_kouassi()
);