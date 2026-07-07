CREATE TABLE public.biens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  adresse text,
  type_bien text CHECK (type_bien IN ('appartement','maison','local_commercial','terrain')),
  statut text NOT NULL DEFAULT 'vacant' CHECK (statut IN ('loue','vacant','en_travaux')),
  type_operation text CHECK (type_operation IN ('location','vente')),
  surface numeric,
  bailleur_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  gestionnaire_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.biens TO authenticated;
GRANT ALL ON public.biens TO service_role;

ALTER TABLE public.biens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all biens" ON public.biens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their biens" ON public.biens
  FOR SELECT TO authenticated USING (gestionnaire_id = auth.uid());

CREATE POLICY "Users can insert their own biens" ON public.biens
  FOR INSERT TO authenticated WITH CHECK (gestionnaire_id = auth.uid());

CREATE POLICY "Admins can insert biens" ON public.biens
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all biens" ON public.biens
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their biens" ON public.biens
  FOR UPDATE TO authenticated USING (gestionnaire_id = auth.uid()) WITH CHECK (gestionnaire_id = auth.uid());

CREATE POLICY "Admins can delete biens" ON public.biens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));