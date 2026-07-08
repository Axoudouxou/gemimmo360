ALTER TABLE public.travaux
  ADD COLUMN IF NOT EXISTS origine text,
  ADD COLUMN IF NOT EXISTS charge_financiere text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS etat_des_lieux_id uuid REFERENCES public.etats_des_lieux(id) ON DELETE SET NULL;