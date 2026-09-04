REVOKE ALL ON FUNCTION public.recompute_echeance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.affecter_paiement_fifo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.affectation_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.echeance_recompute_on_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.affecter_paiement_fifo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_echeance(uuid) TO service_role;