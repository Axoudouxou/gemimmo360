ALTER TABLE public.impots_fonciers DROP CONSTRAINT IF EXISTS impots_fonciers_trimestre_check;
ALTER TABLE public.impots_fonciers ADD CONSTRAINT impots_fonciers_trimestre_check CHECK (trimestre = ANY (ARRAY['T1'::text, 'T2'::text, 'T3'::text, 'T4'::text, 'annuel'::text]));
ALTER TABLE public.impots_fonciers ADD COLUMN IF NOT EXISTS montant_annuel_total NUMERIC;