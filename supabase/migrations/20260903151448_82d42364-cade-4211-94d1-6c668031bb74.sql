DROP POLICY IF EXISTS "Commercial peut gerer les charges" ON public.charges;
CREATE POLICY "Commercial peut gerer les charges"
ON public.charges
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'commercial'))
WITH CHECK (public.has_role(auth.uid(), 'commercial'));