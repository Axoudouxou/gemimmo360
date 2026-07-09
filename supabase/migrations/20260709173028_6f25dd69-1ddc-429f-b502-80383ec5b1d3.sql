
DROP POLICY IF EXISTS contrats_select_wide_roles ON public.contrats;
DROP POLICY IF EXISTS contrats_select_own_portfolio ON public.contrats;
DROP POLICY IF EXISTS contrats_insert_admin_juridique ON public.contrats;
DROP POLICY IF EXISTS contrats_update_admin_juridique ON public.contrats;
DROP POLICY IF EXISTS contrats_update_own_portfolio ON public.contrats;
DROP POLICY IF EXISTS contrats_delete_admin ON public.contrats;
DROP POLICY IF EXISTS direction_all_contrats ON public.contrats;

CREATE POLICY contrats_all_authenticated ON public.contrats FOR ALL TO authenticated USING (true) WITH CHECK (true);
