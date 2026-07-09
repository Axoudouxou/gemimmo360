
-- =========================================================================
-- CONTACTS: lecture pour tous, écriture pour admin/commercial/gestion_locative
-- =========================================================================
DROP POLICY IF EXISTS "Admins can view all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Managers can view their contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can update all contacts" ON public.contacts;
DROP POLICY IF EXISTS "Managers can update their contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;

CREATE POLICY "contacts_select_all_auth" ON public.contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert_write_roles" ON public.contacts
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'commercial')
    OR has_role(auth.uid(), 'gestion_locative')
  );
CREATE POLICY "contacts_update_write_roles" ON public.contacts
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'commercial')
    OR has_role(auth.uid(), 'gestion_locative')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'commercial')
    OR has_role(auth.uid(), 'gestion_locative')
  );
CREATE POLICY "contacts_delete_admin" ON public.contacts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- BIENS: lecture large sauf commercial/gestion_locative (portefeuille);
-- update gestionnaire = admin+juridique; update fiche = admin/juridique full,
-- commercial/gestion_locative scopé; delete = admin
-- =========================================================================
DROP POLICY IF EXISTS "Admins can view all biens" ON public.biens;
DROP POLICY IF EXISTS "Managers can view their biens" ON public.biens;
DROP POLICY IF EXISTS "Admins can insert biens" ON public.biens;
DROP POLICY IF EXISTS "Users can insert their own biens" ON public.biens;
DROP POLICY IF EXISTS "Admins can update all biens" ON public.biens;
DROP POLICY IF EXISTS "Managers can update their biens" ON public.biens;
DROP POLICY IF EXISTS "Admins can delete biens" ON public.biens;

CREATE POLICY "biens_select_wide_roles" ON public.biens
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR has_role(auth.uid(), 'juridique')
    OR has_role(auth.uid(), 'recouvrement')
  );
CREATE POLICY "biens_select_own_portfolio" ON public.biens
  FOR SELECT TO authenticated USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND gestionnaire_id = auth.uid()
  );
CREATE POLICY "biens_insert" ON public.biens
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'juridique')
    OR (
      (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
      AND gestionnaire_id = auth.uid()
    )
  );
CREATE POLICY "biens_update_admin_juridique" ON public.biens
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'));
CREATE POLICY "biens_update_own_portfolio" ON public.biens
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
    AND gestionnaire_id = auth.uid()
  )
  WITH CHECK (
    (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
    AND gestionnaire_id = auth.uid()
  );
CREATE POLICY "biens_delete_admin" ON public.biens
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- LOTS: lecture large sauf commercial/gestion_locative (via bien);
-- update = admin full, commercial/gestion_locative scopé; delete = admin
-- =========================================================================
DROP POLICY IF EXISTS "Admins full access on lots" ON public.lots;
DROP POLICY IF EXISTS "Managers view own bien lots" ON public.lots;
DROP POLICY IF EXISTS "Managers insert own bien lots" ON public.lots;
DROP POLICY IF EXISTS "Managers update own bien lots" ON public.lots;
DROP POLICY IF EXISTS "Managers delete own bien lots" ON public.lots;

CREATE POLICY "lots_select_wide_roles" ON public.lots
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR has_role(auth.uid(), 'juridique')
    OR has_role(auth.uid(), 'recouvrement')
  );
CREATE POLICY "lots_select_own_portfolio" ON public.lots
  FOR SELECT TO authenticated USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid())
  );
CREATE POLICY "lots_insert" ON public.lots
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR (
      (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
      AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid())
    )
  );
CREATE POLICY "lots_update_admin" ON public.lots
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "lots_update_own_portfolio" ON public.lots
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid())
  )
  WITH CHECK (
    (has_role(auth.uid(), 'commercial') OR has_role(auth.uid(), 'gestion_locative'))
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid())
  );
CREATE POLICY "lots_delete_admin" ON public.lots
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- CONTRATS: lecture large sauf commercial/gestion_locative (via bien);
-- update direct = admin + juridique; delete = admin
-- =========================================================================
DROP POLICY IF EXISTS "Admins full access on contrats" ON public.contrats;
DROP POLICY IF EXISTS "Juridique can view contrats" ON public.contrats;
DROP POLICY IF EXISTS "Juridique can insert contrats" ON public.contrats;
DROP POLICY IF EXISTS "Juridique can update contrats" ON public.contrats;
DROP POLICY IF EXISTS "Gestion locative can view own contrats" ON public.contrats;

CREATE POLICY "contrats_select_wide_roles" ON public.contrats
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR has_role(auth.uid(), 'juridique')
    OR has_role(auth.uid(), 'recouvrement')
  );
CREATE POLICY "contrats_select_own_portfolio" ON public.contrats
  FOR SELECT TO authenticated USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (
      SELECT 1 FROM public.lots l JOIN public.biens b ON b.id = l.bien_id
      WHERE l.id = contrats.lot_id AND b.gestionnaire_id = auth.uid()
    )
  );
CREATE POLICY "contrats_insert_admin_juridique" ON public.contrats
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique')
  );
CREATE POLICY "contrats_update_admin_juridique" ON public.contrats
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'));
CREATE POLICY "contrats_delete_admin" ON public.contrats
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- RECLAMATIONS: lecture large sauf commercial/gestion_locative (portefeuille);
-- création = admin + gestion_locative + commercial; traitement = admin + technique
-- =========================================================================
DROP POLICY IF EXISTS "Admins full access on reclamations" ON public.reclamations;
DROP POLICY IF EXISTS "Technique full access on reclamations" ON public.reclamations;
DROP POLICY IF EXISTS "All authenticated can view reclamations" ON public.reclamations;

CREATE POLICY "reclamations_select_wide_roles" ON public.reclamations
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR has_role(auth.uid(), 'juridique')
    OR has_role(auth.uid(), 'recouvrement')
  );
CREATE POLICY "reclamations_select_own_portfolio" ON public.reclamations
  FOR SELECT TO authenticated USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = reclamations.bien_id AND b.gestionnaire_id = auth.uid())
  );
CREATE POLICY "reclamations_insert" ON public.reclamations
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR (
      (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
      AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = reclamations.bien_id AND b.gestionnaire_id = auth.uid())
    )
  );
CREATE POLICY "reclamations_update_admin_technique" ON public.reclamations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technique'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technique'));
CREATE POLICY "reclamations_delete_admin" ON public.reclamations
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- TRAVAUX: lecture large sauf commercial/gestion_locative (portefeuille via lot/bien);
-- création/modif = admin + technique
-- =========================================================================
DROP POLICY IF EXISTS "Admins full access on travaux" ON public.travaux;
DROP POLICY IF EXISTS "Technique full access on travaux" ON public.travaux;
DROP POLICY IF EXISTS "All authenticated can view travaux" ON public.travaux;

CREATE POLICY "travaux_select_wide_roles" ON public.travaux
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'technique')
    OR has_role(auth.uid(), 'juridique')
    OR has_role(auth.uid(), 'recouvrement')
  );
CREATE POLICY "travaux_select_own_portfolio" ON public.travaux
  FOR SELECT TO authenticated USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = travaux.bien_id AND b.gestionnaire_id = auth.uid())
  );
CREATE POLICY "travaux_write_admin_technique" ON public.travaux
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technique'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'technique'));

-- =========================================================================
-- IMPAYES: recouvrement + admin (déjà OK), on garantit l'INSERT non scopé pour recouvrement
-- =========================================================================
DROP POLICY IF EXISTS "Recouvrement can view own impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can insert own impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can update own impayes" ON public.impayes;

CREATE POLICY "impayes_select_recouvrement" ON public.impayes
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'recouvrement'));
CREATE POLICY "impayes_insert_recouvrement" ON public.impayes
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'recouvrement'));
CREATE POLICY "impayes_update_recouvrement" ON public.impayes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'recouvrement'))
  WITH CHECK (has_role(auth.uid(), 'recouvrement'));

-- =========================================================================
-- NOUVELLE TABLE : contrat_modifications_proposees
-- =========================================================================
CREATE TABLE public.contrat_modifications_proposees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id UUID NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  propose_par UUID NOT NULL REFERENCES public.profiles(id),
  champ_modifie TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuvee','rejetee')),
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_par UUID REFERENCES public.profiles(id),
  traite_le TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrat_modifications_proposees TO authenticated;
GRANT ALL ON public.contrat_modifications_proposees TO service_role;

ALTER TABLE public.contrat_modifications_proposees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmp_select_admin_juridique" ON public.contrat_modifications_proposees
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique')
  );
CREATE POLICY "cmp_select_own_or_portfolio" ON public.contrat_modifications_proposees
  FOR SELECT TO authenticated USING (
    propose_par = auth.uid()
    OR (
      (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
      AND EXISTS (
        SELECT 1 FROM public.contrats c
        JOIN public.lots l ON l.id = c.lot_id
        JOIN public.biens b ON b.id = l.bien_id
        WHERE c.id = contrat_modifications_proposees.contrat_id AND b.gestionnaire_id = auth.uid()
      )
    )
  );
CREATE POLICY "cmp_insert_write_roles" ON public.contrat_modifications_proposees
  FOR INSERT TO authenticated WITH CHECK (
    propose_par = auth.uid() AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'juridique')
      OR (
        (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
        AND EXISTS (
          SELECT 1 FROM public.contrats c
          JOIN public.lots l ON l.id = c.lot_id
          JOIN public.biens b ON b.id = l.bien_id
          WHERE c.id = contrat_modifications_proposees.contrat_id AND b.gestionnaire_id = auth.uid()
        )
      )
    )
  );
CREATE POLICY "cmp_update_admin_juridique" ON public.contrat_modifications_proposees
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'juridique'));
CREATE POLICY "cmp_delete_admin" ON public.contrat_modifications_proposees
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- =========================================================================
-- Cascade : suppression d'un contrat supprime aussi impayés et EDL liés
-- =========================================================================
ALTER TABLE public.impayes DROP CONSTRAINT IF EXISTS impayes_contrat_id_fkey;
ALTER TABLE public.impayes ADD CONSTRAINT impayes_contrat_id_fkey
  FOREIGN KEY (contrat_id) REFERENCES public.contrats(id) ON DELETE CASCADE;

ALTER TABLE public.etats_des_lieux DROP CONSTRAINT IF EXISTS etats_des_lieux_contrat_id_fkey;
ALTER TABLE public.etats_des_lieux ADD CONSTRAINT etats_des_lieux_contrat_id_fkey
  FOREIGN KEY (contrat_id) REFERENCES public.contrats(id) ON DELETE CASCADE;
