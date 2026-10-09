CREATE TABLE public.travaux_devis_complementaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  travaux_id uuid NOT NULL REFERENCES public.travaux(id) ON DELETE CASCADE,
  libelle text NOT NULL,
  montant numeric NOT NULL DEFAULT 0 CHECK (montant >= 0),
  date_realisation date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tdc_travaux ON public.travaux_devis_complementaires(travaux_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travaux_devis_complementaires TO authenticated;
GRANT ALL ON public.travaux_devis_complementaires TO service_role;
ALTER TABLE public.travaux_devis_complementaires ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tdc_updated_at BEFORE UPDATE ON public.travaux_devis_complementaires
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY tdc_select ON public.travaux_devis_complementaires FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.travaux t WHERE t.id = travaux_id));
CREATE POLICY tdc_write ON public.travaux_devis_complementaires FOR ALL TO authenticated
  USING (
    public.is_christelle_kouassi() OR public.has_role(auth.uid(),'juridique') OR (
      NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente') AND
      EXISTS (SELECT 1 FROM public.travaux t WHERE t.id = travaux_id AND (
        t.created_by = auth.uid() OR t.assigne_a = auth.uid() OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'technique')))))
  WITH CHECK (
    public.is_christelle_kouassi() OR public.has_role(auth.uid(),'juridique') OR (
      NOT public.has_role(auth.uid(),'recouvrement') AND NOT public.has_role(auth.uid(),'en_attente') AND
      EXISTS (SELECT 1 FROM public.travaux t WHERE t.id = travaux_id AND (
        t.created_by = auth.uid() OR t.assigne_a = auth.uid() OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'direction') OR public.has_role(auth.uid(),'technique')))));