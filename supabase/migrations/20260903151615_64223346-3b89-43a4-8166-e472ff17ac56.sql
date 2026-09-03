ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS mois_rattachement date,
  ADD COLUMN IF NOT EXISTS recurrence_debut date,
  ADD COLUMN IF NOT EXISTS recurrence_fin date,
  ADD COLUMN IF NOT EXISTS frequence text NOT NULL DEFAULT 'mensuelle',
  ADD COLUMN IF NOT EXISTS statut_imputation text NOT NULL DEFAULT 'a_imputer',
  ADD COLUMN IF NOT EXISTS decompte_mois date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.charges SET mois_rattachement = date_trunc('month', date)::date WHERE mois_rattachement IS NULL;
UPDATE public.charges SET recurrence_debut = date_trunc('month', date)::date WHERE recurrente = true AND recurrence_debut IS NULL;

ALTER TABLE public.charges ALTER COLUMN mois_rattachement SET DEFAULT date_trunc('month', now())::date;
ALTER TABLE public.charges ALTER COLUMN mois_rattachement SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.charges ADD CONSTRAINT charges_statut_imputation_check CHECK (statut_imputation IN ('a_imputer','imputee'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.charges ADD CONSTRAINT charges_frequence_check CHECK (frequence IN ('mensuelle','trimestrielle','annuelle','ponctuelle'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_charges_bien_mois ON public.charges (bien_id, mois_rattachement);

DROP TRIGGER IF EXISTS update_charges_updated_at ON public.charges;
CREATE TRIGGER update_charges_updated_at BEFORE UPDATE ON public.charges
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Droits d'accès
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;

DROP POLICY IF EXISTS "Gestion locative view own biens charges" ON public.charges;
DROP POLICY IF EXISTS "Gestion locative insert own biens charges" ON public.charges;
DROP POLICY IF EXISTS "Gestion locative update own biens charges" ON public.charges;
DROP POLICY IF EXISTS "Gestion locative delete own biens charges" ON public.charges;
DROP POLICY IF EXISTS "Commercial peut gerer les charges" ON public.charges;
DROP POLICY IF EXISTS "charges_select_all_authenticated" ON public.charges;
DROP POLICY IF EXISTS "charges_write_roles" ON public.charges;

CREATE POLICY "charges_select_all_authenticated" ON public.charges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "charges_write_roles" ON public.charges
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction')
    OR has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial')
    OR has_role(auth.uid(), 'technico_commercial') OR public.is_christelle_kouassi()
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'direction')
    OR has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial')
    OR has_role(auth.uid(), 'technico_commercial') OR public.is_christelle_kouassi()
  );