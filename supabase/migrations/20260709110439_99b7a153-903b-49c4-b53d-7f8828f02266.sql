
-- CONTRATS: autoriser gestion_locative + commercial à modifier les contrats de leur portefeuille
DROP POLICY IF EXISTS "contrats_update_own_portfolio" ON public.contrats;
CREATE POLICY "contrats_update_own_portfolio" ON public.contrats
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (
      SELECT 1 FROM public.lots l JOIN public.biens b ON b.id = l.bien_id
      WHERE l.id = contrats.lot_id AND b.gestionnaire_id = auth.uid()
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'gestion_locative') OR has_role(auth.uid(), 'commercial'))
    AND EXISTS (
      SELECT 1 FROM public.lots l JOIN public.biens b ON b.id = l.bien_id
      WHERE l.id = contrats.lot_id AND b.gestionnaire_id = auth.uid()
    )
  );

-- LOTS: autoriser juridique à modifier tous les lots
DROP POLICY IF EXISTS "lots_update_juridique" ON public.lots;
CREATE POLICY "lots_update_juridique" ON public.lots
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'juridique'))
  WITH CHECK (has_role(auth.uid(), 'juridique'));
