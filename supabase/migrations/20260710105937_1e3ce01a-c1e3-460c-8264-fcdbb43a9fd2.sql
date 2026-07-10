
-- 1) Commentaires sur activités
CREATE TABLE public.activite_commentaires (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activite_id UUID NOT NULL REFERENCES public.activites(id) ON DELETE CASCADE,
  auteur UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activite_commentaires_activite_id_idx ON public.activite_commentaires(activite_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activite_commentaires TO authenticated;
GRANT ALL ON public.activite_commentaires TO service_role;

ALTER TABLE public.activite_commentaires ENABLE ROW LEVEL SECURITY;

-- Helper: peut voir une activité ?
CREATE OR REPLACE FUNCTION public.can_access_activite(_activite_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activites a
    WHERE a.id = _activite_id
      AND (
        a.created_by = _user_id
        OR a.assigne_a = _user_id
        OR public.has_role(_user_id, 'admin')
        OR public.has_role(_user_id, 'direction')
      )
  );
$$;

CREATE POLICY "read_commentaires" ON public.activite_commentaires
  FOR SELECT TO authenticated
  USING (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "insert_commentaires" ON public.activite_commentaires
  FOR INSERT TO authenticated
  WITH CHECK (auteur = auth.uid() AND public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "update_own_commentaires" ON public.activite_commentaires
  FOR UPDATE TO authenticated
  USING (auteur = auth.uid())
  WITH CHECK (auteur = auth.uid());

CREATE POLICY "delete_own_commentaires" ON public.activite_commentaires
  FOR DELETE TO authenticated
  USING (
    auteur = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'direction')
  );

-- 2) Restreindre DELETE sur activites : seul le créateur, admin ou direction
DROP POLICY IF EXISTS delete_own_activites ON public.activites;
CREATE POLICY "delete_activites_creator_only" ON public.activites
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'direction')
  );

-- 3) Trigger : si l'utilisateur n'est qu'assigné (pas créateur / admin / direction),
-- il ne peut modifier que le champ statut.
CREATE OR REPLACE FUNCTION public.restrict_assignee_activite_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.created_by = uid
     OR public.has_role(uid, 'admin')
     OR public.has_role(uid, 'direction') THEN
    RETURN NEW;
  END IF;
  IF OLD.assigne_a = uid THEN
    IF NEW.titre IS DISTINCT FROM OLD.titre
       OR NEW.type_activite IS DISTINCT FROM OLD.type_activite
       OR NEW.date_debut IS DISTINCT FROM OLD.date_debut
       OR NEW.date_fin IS DISTINCT FROM OLD.date_fin
       OR NEW.lieu IS DISTINCT FROM OLD.lieu
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.priorite IS DISTINCT FROM OLD.priorite
       OR NEW.assigne_a IS DISTINCT FROM OLD.assigne_a
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.bien_id IS DISTINCT FROM OLD.bien_id
       OR NEW.lot_id IS DISTINCT FROM OLD.lot_id
       OR NEW.contrat_id IS DISTINCT FROM OLD.contrat_id
       OR NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      RAISE EXCEPTION 'En tant qu''assigné, vous pouvez uniquement modifier le statut de cette activité.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_assignee_activite_update ON public.activites;
CREATE TRIGGER trg_restrict_assignee_activite_update
  BEFORE UPDATE ON public.activites
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_assignee_activite_update();

-- 4) Profils : date de dernière connexion (mise à jour côté client au login)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;
