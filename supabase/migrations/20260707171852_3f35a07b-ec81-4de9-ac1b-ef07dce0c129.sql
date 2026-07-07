CREATE TABLE public.impayes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  montant_du numeric NOT NULL,
  montant_paye numeric NOT NULL DEFAULT 0,
  date_echeance date NOT NULL,
  statut text NOT NULL DEFAULT 'a_jour' CHECK (statut IN ('a_jour','en_retard','relance_envoyee')),
  date_derniere_relance date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.impayes TO authenticated;
GRANT ALL ON public.impayes TO service_role;

ALTER TABLE public.impayes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on impayes" ON public.impayes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Recouvrement can view impayes" ON public.impayes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'recouvrement'));

CREATE POLICY "Recouvrement can insert impayes" ON public.impayes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'recouvrement'));

CREATE POLICY "Recouvrement can update impayes" ON public.impayes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'recouvrement'))
  WITH CHECK (public.has_role(auth.uid(), 'recouvrement'));