
-- 1. Nouveaux champs sur reclamations
ALTER TABLE public.reclamations
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS categorie text,
  ADD COLUMN IF NOT EXISTS date_incident date,
  ADD COLUMN IF NOT EXISTS solution text,
  ADD COLUMN IF NOT EXISTS prestataire_contacte boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_resolution timestamptz,
  ADD COLUMN IF NOT EXISTS temps_traitement integer,
  ADD COLUMN IF NOT EXISTS date_limite date,
  ADD COLUMN IF NOT EXISTS overdue_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reclamation_id uuid;  -- (no-op placeholder pour éviter erreur si déjà)

ALTER TABLE public.reclamations DROP COLUMN IF EXISTS reclamation_id;

ALTER TABLE public.reclamations
  DROP CONSTRAINT IF EXISTS reclamations_categorie_check;
ALTER TABLE public.reclamations
  ADD CONSTRAINT reclamations_categorie_check
  CHECK (categorie IS NULL OR categorie IN ('plomberie','electricite','securite','proprete','autre'));

ALTER TABLE public.reclamations
  ADD CONSTRAINT reclamations_reference_unique UNIQUE (reference);

-- 2. Génération de référence REC-AAAA-0001
CREATE OR REPLACE FUNCTION public.generate_reclamation_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _year int; _next int;
BEGIN
  IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN RETURN NEW; END IF;
  _year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  SELECT COALESCE(MAX((regexp_replace(reference, '^REC-\d{4}-', ''))::int), 0) + 1
    INTO _next
    FROM public.reclamations
    WHERE reference LIKE 'REC-' || _year || '-%';
  NEW.reference := 'REC-' || _year || '-' || lpad(_next::text, 4, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reclamations_reference ON public.reclamations;
CREATE TRIGGER trg_reclamations_reference
BEFORE INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.generate_reclamation_reference();

-- 3. date_limite auto
CREATE OR REPLACE FUNCTION public.set_reclamation_date_limite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.date_limite IS NULL THEN
    NEW.date_limite := (COALESCE(NEW.created_at, now())::date)
      + CASE NEW.priorite WHEN 'haute' THEN 2 WHEN 'basse' THEN 7 ELSE 5 END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reclamations_date_limite ON public.reclamations;
CREATE TRIGGER trg_reclamations_date_limite
BEFORE INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.set_reclamation_date_limite();

-- 4. Résolution automatique + validation solution
CREATE OR REPLACE FUNCTION public.set_reclamation_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut = 'resolue' AND (OLD.statut IS DISTINCT FROM 'resolue') THEN
    IF NEW.solution IS NULL OR length(trim(NEW.solution)) = 0 THEN
      RAISE EXCEPTION 'Une solution est obligatoire pour clôturer la réclamation.';
    END IF;
    IF NEW.date_resolution IS NULL THEN NEW.date_resolution := now(); END IF;
    NEW.temps_traitement := GREATEST(0, EXTRACT(DAY FROM (NEW.date_resolution - NEW.created_at))::int);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reclamations_resolution ON public.reclamations;
CREATE TRIGGER trg_reclamations_resolution
BEFORE UPDATE ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.set_reclamation_resolution();

-- 5. Historique
CREATE TABLE IF NOT EXISTS public.reclamations_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reclamation_id uuid NOT NULL REFERENCES public.reclamations(id) ON DELETE CASCADE,
  champ_modifie text NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text,
  auteur uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reclamations_historique TO authenticated;
GRANT ALL ON public.reclamations_historique TO service_role;
ALTER TABLE public.reclamations_historique ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Historique recl visible aux authentifies" ON public.reclamations_historique;
CREATE POLICY "Historique recl visible aux authentifies" ON public.reclamations_historique
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_recl_hist_reclamation_id ON public.reclamations_historique(reclamation_id);

CREATE OR REPLACE FUNCTION public.log_reclamation_historique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reclamations_historique(reclamation_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'creation', NULL, NEW.statut, _uid);
    RETURN NEW;
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.reclamations_historique(reclamation_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'statut', OLD.statut, NEW.statut, _uid);
  END IF;
  IF NEW.assigne_a IS DISTINCT FROM OLD.assigne_a THEN
    INSERT INTO public.reclamations_historique(reclamation_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'assigne_a', OLD.assigne_a::text, NEW.assigne_a::text, _uid);
  END IF;
  IF NEW.solution IS DISTINCT FROM OLD.solution AND NEW.solution IS NOT NULL THEN
    INSERT INTO public.reclamations_historique(reclamation_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'solution', NULL, NEW.solution, _uid);
  END IF;
  IF NEW.overdue_flagged IS DISTINCT FROM OLD.overdue_flagged AND NEW.overdue_flagged THEN
    INSERT INTO public.reclamations_historique(reclamation_id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur)
    VALUES (NEW.id, 'retard', NULL, 'Passage en retard', _uid);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_reclamations_hist_ins ON public.reclamations;
CREATE TRIGGER trg_log_reclamations_hist_ins
AFTER INSERT ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.log_reclamation_historique();
DROP TRIGGER IF EXISTS trg_log_reclamations_hist_upd ON public.reclamations;
CREATE TRIGGER trg_log_reclamations_hist_upd
AFTER UPDATE ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.log_reclamation_historique();

-- 6. Ajustement trigger technique pour autoriser les champs nécessaires à la clôture
CREATE OR REPLACE FUNCTION public.restrict_technique_reclamation_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF OLD.created_by = uid OR public.has_role(uid,'admin') OR public.has_role(uid,'direction') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(uid,'technique') THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.locataire_id IS DISTINCT FROM OLD.locataire_id THEN
      RAISE EXCEPTION 'Le profil technique peut uniquement changer statut, priorité, assignation, prestataire, catégorie, solution et documents.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le créateur ou l''équipe technique peut modifier cette réclamation.';
END $$;

-- 7. Détection retard + activité automatique
CREATE OR REPLACE FUNCTION public.detect_overdue_reclamations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; _assignee uuid; _tech uuid;
BEGIN
  SELECT id INTO _tech FROM public.profiles WHERE role = 'technique' ORDER BY created_at LIMIT 1;
  FOR r IN
    SELECT * FROM public.reclamations
    WHERE statut <> 'resolue'
      AND date_limite IS NOT NULL
      AND date_limite < CURRENT_DATE
      AND overdue_flagged = false
  LOOP
    _assignee := COALESCE(r.assigne_a, _tech);
    IF _assignee IS NOT NULL THEN
      INSERT INTO public.activites(titre, type_activite, assigne_a, created_by, priorite, statut, date_debut, date_fin)
      VALUES (
        'Réclamation en retard – ' || COALESCE(r.reference, r.id::text) || ' – ' || r.titre,
        'tache', _assignee, r.created_by, 'urgente', 'a_faire', now(), now() + interval '2 days'
      );
    END IF;
    UPDATE public.reclamations SET overdue_flagged = true WHERE id = r.id;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.detect_overdue_reclamations() TO authenticated;

-- Planification quotidienne
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-overdue-reclamations') THEN
    PERFORM cron.schedule('detect-overdue-reclamations', '0 7 * * *', $c$SELECT public.detect_overdue_reclamations();$c$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 8. Lien travaux -> réclamation
ALTER TABLE public.travaux
  ADD COLUMN IF NOT EXISTS reclamation_id uuid REFERENCES public.reclamations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_travaux_reclamation_id ON public.travaux(reclamation_id);

-- 9. Backfill référence + date_limite pour l'existant
DO $$
DECLARE r RECORD; _year int; _next int; _new_ref text;
BEGIN
  FOR r IN SELECT id, created_at FROM public.reclamations WHERE reference IS NULL ORDER BY created_at LOOP
    _year := EXTRACT(YEAR FROM r.created_at)::int;
    SELECT COALESCE(MAX((regexp_replace(reference, '^REC-\d{4}-', ''))::int), 0) + 1
      INTO _next
      FROM public.reclamations
      WHERE reference LIKE 'REC-' || _year || '-%';
    _new_ref := 'REC-' || _year || '-' || lpad(_next::text, 4, '0');
    UPDATE public.reclamations SET reference = _new_ref WHERE id = r.id;
  END LOOP;
END $$;

UPDATE public.reclamations
   SET date_limite = (created_at::date + CASE priorite WHEN 'haute' THEN 2 WHEN 'basse' THEN 7 ELSE 5 END)
 WHERE date_limite IS NULL;

-- 10. RLS sur le bucket reclamations-documents
DROP POLICY IF EXISTS "recl docs read" ON storage.objects;
DROP POLICY IF EXISTS "recl docs write" ON storage.objects;
DROP POLICY IF EXISTS "recl docs update" ON storage.objects;
DROP POLICY IF EXISTS "recl docs delete" ON storage.objects;
CREATE POLICY "recl docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reclamations-documents');
CREATE POLICY "recl docs write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reclamations-documents');
CREATE POLICY "recl docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'reclamations-documents') WITH CHECK (bucket_id = 'reclamations-documents');
CREATE POLICY "recl docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'reclamations-documents');
