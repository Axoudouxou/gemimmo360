CREATE OR REPLACE FUNCTION public.sync_impaye_statut()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.etape_traitement = 'resolu' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.montant_paye,0) >= NEW.montant_du THEN
    NEW.statut := 'a_jour';
  ELSIF NEW.statut = 'a_jour' THEN
    NEW.statut := CASE WHEN COALESCE(NEW.montant_paye,0) > 0 THEN 'relance_envoyee' ELSE 'en_retard' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_impaye_statut ON public.impayes;
CREATE TRIGGER trg_sync_impaye_statut
BEFORE INSERT OR UPDATE ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.sync_impaye_statut();