DROP POLICY IF EXISTS "permissions_overrides_write" ON public.permissions_overrides;
CREATE POLICY "permissions_overrides_write" ON public.permissions_overrides
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));