
-- Give full access to etats_des_lieux, travaux, reclamations to all roles except recouvrement

-- ===== ETATS DES LIEUX =====
DROP POLICY IF EXISTS "Admins full access on edl" ON public.etats_des_lieux;
DROP POLICY IF EXISTS "Gestion locative view own edl" ON public.etats_des_lieux;
DROP POLICY IF EXISTS "Juridique full access on edl" ON public.etats_des_lieux;
DROP POLICY IF EXISTS "direction_all_edl" ON public.etats_des_lieux;

CREATE POLICY "edl_all_non_recouvrement" ON public.etats_des_lieux
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
);

-- ===== TRAVAUX =====
DROP POLICY IF EXISTS "travaux_select_own_portfolio" ON public.travaux;
DROP POLICY IF EXISTS "travaux_select_wide_roles" ON public.travaux;
DROP POLICY IF EXISTS "travaux_write_admin_technique" ON public.travaux;
DROP POLICY IF EXISTS "direction_all_travaux" ON public.travaux;

CREATE POLICY "travaux_all_non_recouvrement" ON public.travaux
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
);

-- ===== RECLAMATIONS =====
DROP POLICY IF EXISTS "reclamations_select_own_portfolio" ON public.reclamations;
DROP POLICY IF EXISTS "reclamations_select_wide_roles" ON public.reclamations;
DROP POLICY IF EXISTS "reclamations_insert" ON public.reclamations;
DROP POLICY IF EXISTS "reclamations_update_admin_technique" ON public.reclamations;
DROP POLICY IF EXISTS "reclamations_delete_admin" ON public.reclamations;
DROP POLICY IF EXISTS "direction_all_reclamations" ON public.reclamations;

CREATE POLICY "reclamations_all_non_recouvrement" ON public.reclamations
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direction')
  OR has_role(auth.uid(),'juridique') OR has_role(auth.uid(),'gestion_locative')
  OR has_role(auth.uid(),'technique') OR has_role(auth.uid(),'commercial')
);
