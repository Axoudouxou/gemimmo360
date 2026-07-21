CREATE OR REPLACE FUNCTION public.restrict_technique_travaux_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid
     OR public.has_role(uid,'admin')
     OR public.has_role(uid,'direction')
     OR public.is_christelle_kouassi() THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.origine IS DISTINCT FROM OLD.origine
       OR NEW.charge_financiere IS DISTINCT FROM OLD.charge_financiere
       OR NEW.etat_des_lieux_id IS DISTINCT FROM OLD.etat_des_lieux_id THEN
      RAISE EXCEPTION 'Le profil technique peut uniquement changer statut, assignation, prestataire, dates, budget et commentaires.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur ou l''équipe technique peut modifier ces travaux.';
END;
$function$;