CREATE POLICY "Activites archivees masquees" ON public.activites AS RESTRICTIVE FOR SELECT TO authenticated
USING (archive = false OR public.has_role(auth.uid(), 'admin'));