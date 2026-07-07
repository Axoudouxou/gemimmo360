CREATE TABLE public.contrats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  locataire_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  date_debut date,
  date_fin date,
  loyer_mensuel numeric,
  depot_garantie numeric,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','termine','renouvellement')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrats TO authenticated;
GRANT ALL ON public.contrats TO service_role;

ALTER TABLE public.contrats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on contrats" ON public.contrats
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Juridique can view contrats" ON public.contrats
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'juridique'));

CREATE POLICY "Juridique can insert contrats" ON public.contrats
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'juridique'));

CREATE POLICY "Juridique can update contrats" ON public.contrats
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'juridique'))
  WITH CHECK (public.has_role(auth.uid(), 'juridique'));

CREATE POLICY "Gestion locative can view contrats" ON public.contrats
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gestion_locative'));