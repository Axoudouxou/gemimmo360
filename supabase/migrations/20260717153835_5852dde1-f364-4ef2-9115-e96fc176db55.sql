
ALTER TABLE public.transactions_commerciales
  ADD COLUMN IF NOT EXISTS montant_estime NUMERIC,
  ADD COLUMN IF NOT EXISTS date_cloture_prevue DATE,
  ADD COLUMN IF NOT EXISTS gestionnaire_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill gestionnaire_id from contact.gestionnaire_id when possible
UPDATE public.transactions_commerciales t
SET gestionnaire_id = c.gestionnaire_id
FROM public.contacts c
WHERE t.gestionnaire_id IS NULL AND t.contact_id = c.id AND c.gestionnaire_id IS NOT NULL;

-- Refresh RLS: commercial scoping via gestionnaire_id
DROP POLICY IF EXISTS "Commercial view own transactions" ON public.transactions_commerciales;
DROP POLICY IF EXISTS "Commercial insert own transactions" ON public.transactions_commerciales;
DROP POLICY IF EXISTS "Commercial update own transactions" ON public.transactions_commerciales;
DROP POLICY IF EXISTS "Commercial delete own transactions" ON public.transactions_commerciales;

CREATE POLICY "Commercial view own transactions" ON public.transactions_commerciales
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'commercial') AND gestionnaire_id = auth.uid());

CREATE POLICY "Commercial insert own transactions" ON public.transactions_commerciales
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'commercial') AND gestionnaire_id = auth.uid());

CREATE POLICY "Commercial update own transactions" ON public.transactions_commerciales
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'commercial') AND gestionnaire_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'commercial') AND gestionnaire_id = auth.uid());

CREATE POLICY "Commercial delete own transactions" ON public.transactions_commerciales
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'commercial') AND gestionnaire_id = auth.uid());
