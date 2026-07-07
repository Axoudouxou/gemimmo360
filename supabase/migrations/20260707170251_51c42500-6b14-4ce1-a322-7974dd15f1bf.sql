
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT,
  telephone TEXT,
  email TEXT,
  type_contact TEXT CHECK (type_contact IN ('proprietaire','locataire','prospect','acheteur','vendeur')),
  gestionnaire_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (gestionnaire_id = auth.uid());

CREATE POLICY "Admins can insert contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (gestionnaire_id = auth.uid());

CREATE POLICY "Admins can update all contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update their contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (gestionnaire_id = auth.uid())
  WITH CHECK (gestionnaire_id = auth.uid());

CREATE POLICY "Admins can delete contacts" ON public.contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
