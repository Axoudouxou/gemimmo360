-- ========== CHARGES ==========
CREATE TABLE public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  libelle text NOT NULL,
  montant numeric NOT NULL,
  date date NOT NULL,
  recurrente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on charges" ON public.charges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Gestion locative view own biens charges" ON public.charges
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = charges.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Gestion locative insert own biens charges" ON public.charges
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = charges.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Gestion locative update own biens charges" ON public.charges
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = charges.bien_id AND b.gestionnaire_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = charges.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Gestion locative delete own biens charges" ON public.charges
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (SELECT 1 FROM public.biens b WHERE b.id = charges.bien_id AND b.gestionnaire_id = auth.uid()));

-- ========== TRAVAUX ==========
CREATE TABLE public.travaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text,
  budget_prevu numeric,
  budget_depense numeric NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie','en_cours','termine')),
  date_debut date,
  date_fin date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travaux TO authenticated;
GRANT ALL ON public.travaux TO service_role;
ALTER TABLE public.travaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on travaux" ON public.travaux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Technique full access on travaux" ON public.travaux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'technique'))
  WITH CHECK (public.has_role(auth.uid(), 'technique'));

CREATE POLICY "All authenticated can view travaux" ON public.travaux
  FOR SELECT TO authenticated USING (true);

-- ========== RECLAMATIONS ==========
CREATE TABLE public.reclamations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  locataire_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  titre text NOT NULL,
  description text,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','en_cours','resolue')),
  priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reclamations TO authenticated;
GRANT ALL ON public.reclamations TO service_role;
ALTER TABLE public.reclamations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on reclamations" ON public.reclamations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Technique full access on reclamations" ON public.reclamations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'technique'))
  WITH CHECK (public.has_role(auth.uid(), 'technique'));

CREATE POLICY "All authenticated can view reclamations" ON public.reclamations
  FOR SELECT TO authenticated USING (true);

-- ========== ETATS DES LIEUX ==========
CREATE TABLE public.etats_des_lieux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entree','sortie')),
  date_realisation date NOT NULL,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etats_des_lieux TO authenticated;
GRANT ALL ON public.etats_des_lieux TO service_role;
ALTER TABLE public.etats_des_lieux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on edl" ON public.etats_des_lieux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Juridique full access on edl" ON public.etats_des_lieux
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'juridique'))
  WITH CHECK (public.has_role(auth.uid(), 'juridique'));

CREATE POLICY "Gestion locative view edl" ON public.etats_des_lieux
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestion_locative'));

-- ========== TRANSACTIONS COMMERCIALES ==========
CREATE TABLE public.transactions_commerciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  bien_id uuid REFERENCES public.biens(id) ON DELETE SET NULL,
  type_transaction text NOT NULL CHECK (type_transaction IN ('mandat','visite','offre')),
  statut_opportunite text NOT NULL DEFAULT 'nouveau' CHECK (statut_opportunite IN ('nouveau','en_cours','gagne','perdu')),
  date_visite date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions_commerciales TO authenticated;
GRANT ALL ON public.transactions_commerciales TO service_role;
ALTER TABLE public.transactions_commerciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on transactions" ON public.transactions_commerciales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Commercial view own transactions" ON public.transactions_commerciales
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'commercial')
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = transactions_commerciales.contact_id AND c.gestionnaire_id = auth.uid()));

CREATE POLICY "Commercial insert own transactions" ON public.transactions_commerciales
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'commercial')
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = transactions_commerciales.contact_id AND c.gestionnaire_id = auth.uid()));

CREATE POLICY "Commercial update own transactions" ON public.transactions_commerciales
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'commercial')
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = transactions_commerciales.contact_id AND c.gestionnaire_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'commercial')
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = transactions_commerciales.contact_id AND c.gestionnaire_id = auth.uid()));

CREATE POLICY "Commercial delete own transactions" ON public.transactions_commerciales
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'commercial')
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = transactions_commerciales.contact_id AND c.gestionnaire_id = auth.uid()));