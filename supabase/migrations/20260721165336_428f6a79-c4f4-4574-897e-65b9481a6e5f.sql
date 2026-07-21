
ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS transaction_origine_id UUID REFERENCES public.transactions_commerciales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_transaction_origine_id ON public.contrats(transaction_origine_id);

ALTER TABLE public.biens DROP CONSTRAINT IF EXISTS biens_statut_check;
ALTER TABLE public.biens ADD CONSTRAINT biens_statut_check
  CHECK (statut = ANY (ARRAY['loue'::text, 'vacant'::text, 'en_travaux'::text, 'vendu'::text]));

ALTER TABLE public.lots DROP CONSTRAINT IF EXISTS lots_statut_check;
ALTER TABLE public.lots ADD CONSTRAINT lots_statut_check
  CHECK (statut = ANY (ARRAY['loue'::text, 'vacant'::text, 'en_travaux'::text, 'vendu'::text]));
