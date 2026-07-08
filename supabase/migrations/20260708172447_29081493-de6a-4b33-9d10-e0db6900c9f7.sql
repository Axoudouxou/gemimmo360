
DELETE FROM public.contrats;
DELETE FROM public.biens;

ALTER TABLE public.biens DROP CONSTRAINT IF EXISTS biens_type_bien_check;
ALTER TABLE public.biens ADD CONSTRAINT biens_type_bien_check
  CHECK (type_bien IN ('appartement','maison','local_commercial','terrain','immeuble'));

CREATE TABLE public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  label text NOT NULL,
  type_lot text,
  statut text NOT NULL DEFAULT 'vacant' CHECK (statut IN ('loue','vacant','en_travaux')),
  surface numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on lots" ON public.lots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers view own bien lots" ON public.lots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Managers insert own bien lots" ON public.lots
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Managers update own bien lots" ON public.lots
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid()));

CREATE POLICY "Managers delete own bien lots" ON public.lots
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.biens b WHERE b.id = lots.bien_id AND b.gestionnaire_id = auth.uid()));

-- Drop policies that depend on contrats.bien_id first
DROP POLICY IF EXISTS "Gestion locative can view own contrats" ON public.contrats;
DROP POLICY IF EXISTS "Gestion locative view own edl" ON public.etats_des_lieux;
DROP POLICY IF EXISTS "Recouvrement can view own impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can insert own impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can update own impayes" ON public.impayes;

ALTER TABLE public.contrats DROP COLUMN bien_id;
ALTER TABLE public.contrats ADD COLUMN lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE;

CREATE POLICY "Gestion locative can view own contrats" ON public.contrats
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (
      SELECT 1 FROM public.lots l
      JOIN public.biens b ON b.id = l.bien_id
      WHERE l.id = contrats.lot_id AND b.gestionnaire_id = auth.uid()
    )
  );

CREATE POLICY "Gestion locative view own edl" ON public.etats_des_lieux
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestion_locative')
    AND EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.lots l ON l.id = c.lot_id
      JOIN public.biens b ON b.id = l.bien_id
      WHERE c.id = etats_des_lieux.contrat_id AND b.gestionnaire_id = auth.uid()
    )
  );

CREATE POLICY "Recouvrement can view own impayes" ON public.impayes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'recouvrement')
    AND EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.lots l ON l.id = c.lot_id
      JOIN public.biens b ON b.id = l.bien_id
      WHERE c.id = impayes.contrat_id AND b.gestionnaire_id = auth.uid()
    )
  );

CREATE POLICY "Recouvrement can insert own impayes" ON public.impayes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'recouvrement')
    AND EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.lots l ON l.id = c.lot_id
      JOIN public.biens b ON b.id = l.bien_id
      WHERE c.id = impayes.contrat_id AND b.gestionnaire_id = auth.uid()
    )
  );

CREATE POLICY "Recouvrement can update own impayes" ON public.impayes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'recouvrement')
    AND EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.lots l ON l.id = c.lot_id
      JOIN public.biens b ON b.id = l.bien_id
      WHERE c.id = impayes.contrat_id AND b.gestionnaire_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'recouvrement')
    AND EXISTS (
      SELECT 1 FROM public.contrats c
      JOIN public.lots l ON l.id = c.lot_id
      JOIN public.biens b ON b.id = l.bien_id
      WHERE c.id = impayes.contrat_id AND b.gestionnaire_id = auth.uid()
    )
  );

ALTER TABLE public.imports DROP CONSTRAINT IF EXISTS imports_type_import_check;
ALTER TABLE public.imports ADD CONSTRAINT imports_type_import_check
  CHECK (type_import IN ('contacts','biens','contrats','lots'));
