-- Convertir les anciennes valeurs vers les nouvelles
UPDATE public.transactions_commerciales SET type_transaction = 'mandat_vente' WHERE type_transaction = 'mandat';
UPDATE public.transactions_commerciales SET type_transaction = 'offre' WHERE type_transaction = 'visite';

ALTER TABLE public.transactions_commerciales DROP CONSTRAINT IF EXISTS transactions_commerciales_type_transaction_check;
ALTER TABLE public.transactions_commerciales ADD CONSTRAINT transactions_commerciales_type_transaction_check
  CHECK (type_transaction = ANY (ARRAY['mandat_location'::text, 'mandat_gestion'::text, 'mandat_vente'::text, 'offre'::text]));

ALTER TABLE public.transactions_commerciales
  ADD COLUMN IF NOT EXISTS exclusivite text,
  ADD COLUMN IF NOT EXISTS motif_perdu text,
  ADD COLUMN IF NOT EXISTS date_debut_mandat date,
  ADD COLUMN IF NOT EXISTS date_fin_mandat date,
  ADD COLUMN IF NOT EXISTS duree_indeterminee boolean NOT NULL DEFAULT true;

ALTER TABLE public.transactions_commerciales DROP CONSTRAINT IF EXISTS transactions_commerciales_exclusivite_check;
ALTER TABLE public.transactions_commerciales ADD CONSTRAINT transactions_commerciales_exclusivite_check
  CHECK (exclusivite IS NULL OR exclusivite = ANY (ARRAY['exclusif'::text, 'non_exclusif'::text]));