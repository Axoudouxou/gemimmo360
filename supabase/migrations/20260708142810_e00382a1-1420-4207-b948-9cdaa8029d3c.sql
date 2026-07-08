
-- CONTRATS: restrict gestion_locative to their own portfolio (read-only)
DROP POLICY IF EXISTS "Gestion locative can view contrats" ON public.contrats;
CREATE POLICY "Gestion locative can view own contrats"
ON public.contrats FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestion_locative')
  AND EXISTS (
    SELECT 1 FROM public.biens b
    WHERE b.id = contrats.bien_id
      AND b.gestionnaire_id = auth.uid()
  )
);

-- ETATS_DES_LIEUX: restrict gestion_locative to their portfolio (read-only)
DROP POLICY IF EXISTS "Gestion locative view edl" ON public.etats_des_lieux;
CREATE POLICY "Gestion locative view own edl"
ON public.etats_des_lieux FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestion_locative')
  AND EXISTS (
    SELECT 1
    FROM public.contrats c
    JOIN public.biens b ON b.id = c.bien_id
    WHERE c.id = etats_des_lieux.contrat_id
      AND b.gestionnaire_id = auth.uid()
  )
);

-- IMPAYES: restrict recouvrement to their portfolio (read + write)
DROP POLICY IF EXISTS "Recouvrement can view impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can insert impayes" ON public.impayes;
DROP POLICY IF EXISTS "Recouvrement can update impayes" ON public.impayes;

CREATE POLICY "Recouvrement can view own impayes"
ON public.impayes FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'recouvrement')
  AND EXISTS (
    SELECT 1
    FROM public.contrats c
    JOIN public.biens b ON b.id = c.bien_id
    WHERE c.id = impayes.contrat_id
      AND b.gestionnaire_id = auth.uid()
  )
);

CREATE POLICY "Recouvrement can insert own impayes"
ON public.impayes FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'recouvrement')
  AND EXISTS (
    SELECT 1
    FROM public.contrats c
    JOIN public.biens b ON b.id = c.bien_id
    WHERE c.id = impayes.contrat_id
      AND b.gestionnaire_id = auth.uid()
  )
);

CREATE POLICY "Recouvrement can update own impayes"
ON public.impayes FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'recouvrement')
  AND EXISTS (
    SELECT 1
    FROM public.contrats c
    JOIN public.biens b ON b.id = c.bien_id
    WHERE c.id = impayes.contrat_id
      AND b.gestionnaire_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'recouvrement')
  AND EXISTS (
    SELECT 1
    FROM public.contrats c
    JOIN public.biens b ON b.id = c.bien_id
    WHERE c.id = impayes.contrat_id
      AND b.gestionnaire_id = auth.uid()
  )
);
