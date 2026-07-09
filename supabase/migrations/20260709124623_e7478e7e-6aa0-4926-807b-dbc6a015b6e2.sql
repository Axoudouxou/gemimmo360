
-- 1. Add "direction" role support (role stored as text in profiles, so just documentation)
-- Update has_role usage: direction should have same rights as admin except for imports/doublons/users pages (frontend-enforced)

-- 2. Create activites table
CREATE TABLE public.activites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titre TEXT NOT NULL,
  type_activite TEXT NOT NULL DEFAULT 'tache',
  date_debut TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  assigne_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lieu TEXT,
  bien_id UUID REFERENCES public.biens(id) ON DELETE SET NULL,
  lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL,
  contrat_id UUID REFERENCES public.contrats(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  statut TEXT NOT NULL DEFAULT 'a_faire',
  priorite TEXT NOT NULL DEFAULT 'normale',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activites TO authenticated;
GRANT ALL ON public.activites TO service_role;

ALTER TABLE public.activites ENABLE ROW LEVEL SECURITY;

-- Admin and direction see everything
CREATE POLICY "admin_direction_all_activites" ON public.activites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'));

-- Users see their own activities (as assignee)
CREATE POLICY "own_activites_select" ON public.activites
  FOR SELECT TO authenticated
  USING (assigne_a = auth.uid() OR created_by = auth.uid());

-- Users can read others' calendars (read-only) - for "Voir le calendrier de" feature
CREATE POLICY "read_all_activites_for_calendar" ON public.activites
  FOR SELECT TO authenticated
  USING (true);

-- Users can create activities (for themselves or assign to others)
CREATE POLICY "insert_activites" ON public.activites
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Users can update/delete their own (assigned to them or created by them)
CREATE POLICY "update_own_activites" ON public.activites
  FOR UPDATE TO authenticated
  USING (assigne_a = auth.uid() OR created_by = auth.uid())
  WITH CHECK (assigne_a = auth.uid() OR created_by = auth.uid());

CREATE POLICY "delete_own_activites" ON public.activites
  FOR DELETE TO authenticated
  USING (assigne_a = auth.uid() OR created_by = auth.uid());

CREATE TRIGGER update_activites_updated_at
  BEFORE UPDATE ON public.activites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_activites_assigne_a ON public.activites(assigne_a);
CREATE INDEX idx_activites_date_debut ON public.activites(date_debut);
CREATE INDEX idx_activites_statut ON public.activites(statut);
CREATE INDEX idx_activites_bien_id ON public.activites(bien_id);
CREATE INDEX idx_activites_lot_id ON public.activites(lot_id);
CREATE INDEX idx_activites_contrat_id ON public.activites(contrat_id);
CREATE INDEX idx_activites_contact_id ON public.activites(contact_id);

-- 3. Extend RLS: direction gets same rights as admin on all tables

-- biens
DROP POLICY IF EXISTS "direction_all_biens" ON public.biens;
CREATE POLICY "direction_all_biens" ON public.biens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- lots
DROP POLICY IF EXISTS "direction_all_lots" ON public.lots;
CREATE POLICY "direction_all_lots" ON public.lots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- contacts
DROP POLICY IF EXISTS "direction_all_contacts" ON public.contacts;
CREATE POLICY "direction_all_contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- contrats
DROP POLICY IF EXISTS "direction_all_contrats" ON public.contrats;
CREATE POLICY "direction_all_contrats" ON public.contrats
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- impayes
DROP POLICY IF EXISTS "direction_all_impayes" ON public.impayes;
CREATE POLICY "direction_all_impayes" ON public.impayes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- charges
DROP POLICY IF EXISTS "direction_all_charges" ON public.charges;
CREATE POLICY "direction_all_charges" ON public.charges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- travaux
DROP POLICY IF EXISTS "direction_all_travaux" ON public.travaux;
CREATE POLICY "direction_all_travaux" ON public.travaux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- reclamations
DROP POLICY IF EXISTS "direction_all_reclamations" ON public.reclamations;
CREATE POLICY "direction_all_reclamations" ON public.reclamations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- transactions_commerciales
DROP POLICY IF EXISTS "direction_all_transactions" ON public.transactions_commerciales;
CREATE POLICY "direction_all_transactions" ON public.transactions_commerciales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- etats_des_lieux
DROP POLICY IF EXISTS "direction_all_edl" ON public.etats_des_lieux;
CREATE POLICY "direction_all_edl" ON public.etats_des_lieux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'direction'));

-- profiles: direction can read all profiles (needed for "Voir calendrier de", assign, team monitoring)
DROP POLICY IF EXISTS "direction_read_profiles" ON public.profiles;
CREATE POLICY "direction_read_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'direction'));

-- Allow all authenticated to read basic profile info (needed for assignee selection & search)
DROP POLICY IF EXISTS "authenticated_read_profiles_basic" ON public.profiles;
CREATE POLICY "authenticated_read_profiles_basic" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);
