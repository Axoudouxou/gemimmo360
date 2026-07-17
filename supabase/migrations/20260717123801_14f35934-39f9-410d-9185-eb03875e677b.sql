
ALTER TABLE public.activites
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'aucune',
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions_commerciales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activites_transaction_id ON public.activites(transaction_id);
