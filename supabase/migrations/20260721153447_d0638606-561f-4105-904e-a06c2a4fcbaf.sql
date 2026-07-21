
CREATE OR REPLACE FUNCTION public.log_impaye_cloture(_impaye_id uuid, _from_etape text, _note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.impayes_historique(impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
  VALUES (_impaye_id, 'cloture_procedure', COALESCE(_from_etape, ''), COALESCE(_note, 'Procédure arrêtée suite à paiement'), _uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_impaye_cloture(uuid, text, text) TO authenticated;
