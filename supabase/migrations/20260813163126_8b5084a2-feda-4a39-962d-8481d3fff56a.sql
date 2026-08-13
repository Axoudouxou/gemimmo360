ALTER TABLE public.travaux
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS priorite text NOT NULL DEFAULT 'normale',
  ADD COLUMN IF NOT EXISTS categorie text,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_echeance date,
  ADD COLUMN IF NOT EXISTS date_intervention_prevue date,
  ADD COLUMN IF NOT EXISTS heure_intervention text,
  ADD COLUMN IF NOT EXISTS date_intervention_reelle date,
  ADD COLUMN IF NOT EXISTS commentaire_intervention text;

ALTER TABLE public.travaux DROP CONSTRAINT IF EXISTS travaux_priorite_check;
ALTER TABLE public.travaux ADD CONSTRAINT travaux_priorite_check
  CHECK (priorite = ANY (ARRAY['critique'::text,'haute'::text,'normale'::text,'basse'::text]));

-- Backfill des références existantes (par année, ordre de création)
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM created_at)::int AS y,
         row_number() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at, id) AS rn
  FROM public.travaux
  WHERE reference IS NULL OR reference = ''
)
UPDATE public.travaux t
SET reference = 'TRV-' || n.y || '-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE t.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS travaux_reference_key ON public.travaux(reference);

CREATE OR REPLACE FUNCTION public.generate_travaux_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _year int; _next int;
BEGIN
  IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN RETURN NEW; END IF;
  _year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  SELECT COALESCE(MAX((regexp_replace(reference, '^TRV-\d{4}-', ''))::int), 0) + 1
    INTO _next
    FROM public.travaux
    WHERE reference LIKE 'TRV-' || _year || '-%';
  NEW.reference := 'TRV-' || _year || '-' || lpad(_next::text, 4, '0');
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_generate_travaux_reference ON public.travaux;
CREATE TRIGGER trg_generate_travaux_reference
  BEFORE INSERT ON public.travaux
  FOR EACH ROW EXECUTE FUNCTION public.generate_travaux_reference();

CREATE OR REPLACE FUNCTION public.log_travaux_historique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  IF NEW.motif_refus IS DISTINCT FROM OLD.motif_refus AND NEW.motif_refus IS NOT NULL THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'motif_refus', OLD.motif_refus, NEW.motif_refus, _uid);
  END IF;
  IF NEW.priorite IS DISTINCT FROM OLD.priorite THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'priorite', OLD.priorite, NEW.priorite, _uid);
  END IF;
  IF NEW.assigne_a IS DISTINCT FROM OLD.assigne_a THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'assigne_a', OLD.assigne_a::text, NEW.assigne_a::text, _uid);
  END IF;
  IF NEW.date_echeance IS DISTINCT FROM OLD.date_echeance THEN
    INSERT INTO public.travaux_historique(travaux_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'date_echeance', OLD.date_echeance::text, NEW.date_echeance::text, _uid);
  END IF;

  RETURN NEW;
END;
$function$;