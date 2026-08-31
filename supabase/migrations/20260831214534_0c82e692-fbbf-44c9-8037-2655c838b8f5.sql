CREATE TABLE public.activite_assignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id uuid NOT NULL REFERENCES public.activites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activite_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activite_assignes TO authenticated;
GRANT ALL ON public.activite_assignes TO service_role;
ALTER TABLE public.activite_assignes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activite_biens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id uuid NOT NULL REFERENCES public.activites(id) ON DELETE CASCADE,
  bien_id uuid NOT NULL REFERENCES public.biens(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activite_id, bien_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activite_biens TO authenticated;
GRANT ALL ON public.activite_biens TO service_role;
ALTER TABLE public.activite_biens ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_activite_assignes_user ON public.activite_assignes(user_id);
CREATE INDEX idx_activite_biens_bien ON public.activite_biens(bien_id);

-- Backfill from existing single-value columns
INSERT INTO public.activite_assignes (activite_id, user_id)
SELECT a.id, a.assigne_a FROM public.activites a
WHERE a.assigne_a IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.activite_biens (activite_id, bien_id)
SELECT a.id, a.bien_id FROM public.activites a
WHERE a.bien_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Access: any assignee (main or co-assignee), creator, admin, direction
CREATE OR REPLACE FUNCTION public.can_access_activite(_activite_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.activites a
    WHERE a.id = _activite_id
      AND (
        a.created_by = _user_id
        OR a.assigne_a = _user_id
        OR EXISTS (
          SELECT 1 FROM public.activite_assignes aa
          WHERE aa.activite_id = a.id AND aa.user_id = _user_id
        )
        OR public.has_role(_user_id, 'admin')
        OR public.has_role(_user_id, 'direction')
      )
  );
$function$;

CREATE POLICY "Assignes peuvent voir l'activite"
ON public.activites FOR SELECT TO authenticated
USING (public.can_access_activite(id, auth.uid()));

CREATE POLICY "Assignes peuvent modifier l'activite"
ON public.activites FOR UPDATE TO authenticated
USING (public.can_access_activite(id, auth.uid()))
WITH CHECK (public.can_access_activite(id, auth.uid()));

CREATE POLICY "Acces liste assignes"
ON public.activite_assignes FOR SELECT TO authenticated
USING (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "Gestion liste assignes"
ON public.activite_assignes FOR INSERT TO authenticated
WITH CHECK (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "Suppression liste assignes"
ON public.activite_assignes FOR DELETE TO authenticated
USING (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "Acces biens activite"
ON public.activite_biens FOR SELECT TO authenticated
USING (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "Gestion biens activite"
ON public.activite_biens FOR INSERT TO authenticated
WITH CHECK (public.can_access_activite(activite_id, auth.uid()));

CREATE POLICY "Suppression biens activite"
ON public.activite_biens FOR DELETE TO authenticated
USING (public.can_access_activite(activite_id, auth.uid()));

-- Notify co-assignees on insert
CREATE OR REPLACE FUNCTION public.notify_activite_coassigne()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_titre text;
BEGIN
  SELECT titre INTO v_titre FROM public.activites WHERE id = NEW.activite_id;
  IF NEW.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM public.dispatch_notification(
      NEW.user_id,
      'activite_assignee',
      'Nouvelle tâche partagée',
      COALESCE(v_titre, 'Une tâche vous a été attribuée'),
      '/calendrier?open=' || NEW.activite_id::text,
      'activite',
      NEW.activite_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_activite_coassigne
AFTER INSERT ON public.activite_assignes
FOR EACH ROW EXECUTE FUNCTION public.notify_activite_coassigne();