
-- 1. Add reference_cheque column
ALTER TABLE public.travaux ADD COLUMN IF NOT EXISTS reference_cheque text;

-- 2. Drop prestataire_id column
ALTER TABLE public.travaux DROP COLUMN IF EXISTS prestataire_id;

-- 3. Nominative access based on email for Christelle Kouassi
CREATE OR REPLACE FUNCTION public.is_christelle_kouassi()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'christelle.kouassi@gem-immobilier.org'
  )
$$;

-- Replace UUID-based Christelle policies with email-based ones
DROP POLICY IF EXISTS christelle_full_travaux ON public.travaux;
DROP POLICY IF EXISTS christelle_full_travaux_comm ON public.travaux_commentaires;

CREATE POLICY christelle_travaux_access ON public.travaux
  FOR ALL
  USING (public.is_christelle_kouassi())
  WITH CHECK (public.is_christelle_kouassi());

CREATE POLICY christelle_travaux_comm_access ON public.travaux_commentaires
  FOR ALL
  USING (public.is_christelle_kouassi())
  WITH CHECK (public.is_christelle_kouassi());
