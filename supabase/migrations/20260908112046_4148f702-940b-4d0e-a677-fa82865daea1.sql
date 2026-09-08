
CREATE OR REPLACE FUNCTION public.is_staff_actif()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role <> 'en_attente'
  )
$$;
REVOKE ALL ON FUNCTION public.is_staff_actif() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_actif() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_travaux_reference() FROM PUBLIC, anon;

-- contrats
DROP POLICY IF EXISTS contrats_all_authenticated ON public.contrats;
CREATE POLICY contrats_select_staff ON public.contrats FOR SELECT TO authenticated
  USING (public.is_staff_actif());
CREATE POLICY contrats_insert_staff ON public.contrats FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_actif());
CREATE POLICY contrats_update_staff ON public.contrats FOR UPDATE TO authenticated
  USING (public.is_staff_actif()) WITH CHECK (public.is_staff_actif());
CREATE POLICY contrats_delete_staff ON public.contrats FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction') OR has_role(auth.uid(), 'gestion_locative'));

-- historiques
DROP POLICY IF EXISTS "Historique visible aux authentifies" ON public.impayes_historique;
CREATE POLICY impayes_historique_select ON public.impayes_historique FOR SELECT TO authenticated
  USING (NOT has_role(auth.uid(), 'en_attente'));

DROP POLICY IF EXISTS "Historique travaux visible aux authentifies" ON public.travaux_historique;
CREATE POLICY travaux_historique_select ON public.travaux_historique FOR SELECT TO authenticated
  USING (
    public.is_christelle_kouassi()
    OR has_role(auth.uid(), 'juridique')
    OR ((NOT has_role(auth.uid(), 'recouvrement')) AND (NOT has_role(auth.uid(), 'en_attente')))
  );

DROP POLICY IF EXISTS "Historique recl visible aux authentifies" ON public.reclamations_historique;
CREATE POLICY reclamations_historique_select ON public.reclamations_historique FOR SELECT TO authenticated
  USING (
    auth.uid() = '2f7ca4a8-1730-4d83-88fb-3faa423dcaf6'::uuid
    OR ((NOT has_role(auth.uid(), 'recouvrement')) AND (NOT has_role(auth.uid(), 'en_attente')))
  );

-- profiles
DROP POLICY IF EXISTS authenticated_read_profiles_basic ON public.profiles;
CREATE POLICY staff_read_profiles_basic ON public.profiles FOR SELECT TO authenticated
  USING (public.is_staff_actif());

-- quittances
DROP POLICY IF EXISTS "Lecture des quittances" ON public.quittances;
CREATE POLICY quittances_select_roles ON public.quittances FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction')
    OR has_role(auth.uid(), 'recouvrement') OR has_role(auth.uid(), 'gestion_locative')
    OR has_role(auth.uid(), 'juridique')
  );
