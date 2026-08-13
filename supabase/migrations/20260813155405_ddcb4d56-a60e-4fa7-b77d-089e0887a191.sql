-- 1. Statuts: ajouter en_attente et fermee
ALTER TABLE public.reclamations DROP CONSTRAINT IF EXISTS reclamations_statut_check;
ALTER TABLE public.reclamations
  ADD CONSTRAINT reclamations_statut_check
  CHECK (statut IN ('ouverte','en_cours','en_attente','resolue','fermee'));

-- 2. Priorités: ajouter critique, moyenne, basse (conserver haute/normale)
ALTER TABLE public.reclamations DROP CONSTRAINT IF EXISTS reclamations_priorite_check;
ALTER TABLE public.reclamations
  ADD CONSTRAINT reclamations_priorite_check
  CHECK (priorite IN ('critique','haute','moyenne','normale','basse'));

-- 3. SLA par priorité sur date_limite (sans écraser une saisie manuelle)
CREATE OR REPLACE FUNCTION public.set_reclamation_date_limite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.date_limite IS NULL THEN
    NEW.date_limite := (COALESCE(NEW.created_at, now())::date)
      + CASE NEW.priorite
          WHEN 'critique' THEN 1
          WHEN 'haute' THEN 2
          WHEN 'moyenne' THEN 3
          WHEN 'normale' THEN 3
          WHEN 'basse' THEN 7
          ELSE 3
        END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reclamations_date_limite ON public.reclamations;
CREATE TRIGGER trg_reclamations_date_limite
BEFORE INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.set_reclamation_date_limite();