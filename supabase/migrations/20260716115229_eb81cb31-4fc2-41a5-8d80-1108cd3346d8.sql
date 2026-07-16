
-- 1) Table notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  entity_type text,
  entity_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications (user_id) WHERE read = false;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notifications select" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2) Config interne (secret d'appel + site_url)
CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);
GRANT SELECT ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_config(key, value) VALUES
  ('internal_email_secret', encode(gen_random_bytes(32), 'hex')),
  ('site_url', 'https://gemimmo360.lovable.app')
ON CONFLICT (key) DO NOTHING;

-- 3) Helper libellé
CREATE OR REPLACE FUNCTION public.notif_display_name(_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(email, ''), 'un collègue') FROM public.profiles WHERE id = _user_id;
$$;

-- 4) Fonction de dispatch
CREATE OR REPLACE FUNCTION public.dispatch_notification(
  _user_id uuid,
  _type text,
  _title text,
  _message text,
  _link text,
  _entity_type text,
  _entity_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text; _secret text; _site text;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, type, title, message, link, entity_type, entity_id)
  VALUES (_user_id, _type, _title, _message, _link, _entity_type, _entity_id);

  SELECT email INTO _email FROM public.profiles WHERE id = _user_id;
  IF _email IS NULL THEN RETURN; END IF;

  SELECT value INTO _secret FROM public.app_config WHERE key = 'internal_email_secret';
  SELECT value INTO _site FROM public.app_config WHERE key = 'site_url';

  BEGIN
    PERFORM net.http_post(
      url := _site || '/api/public/notifications/send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', _secret
      ),
      body := jsonb_build_object(
        'templateName', 'notification',
        'recipientEmail', _email,
        'templateData', jsonb_build_object(
          'title', _title,
          'message', COALESCE(_message, ''),
          'link', _site || COALESCE(_link, '/dashboard'),
          'type', _type
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- 5) Trigger activites (assignation)
CREATE OR REPLACE FUNCTION public.notify_activite_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'activite_assignee', 'Nouvelle tâche assignée',
    _assigner || ' vous a assigné : ' || NEW.titre,
    '/calendrier', 'activite', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_activite_assignee
AFTER INSERT OR UPDATE OF assigne_a ON public.activites
FOR EACH ROW EXECUTE FUNCTION public.notify_activite_assignee();

-- 6) Trigger travaux
CREATE OR REPLACE FUNCTION public.notify_travaux_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'travaux_assignee', 'Travaux assignés',
    _assigner || ' vous a assigné les travaux : ' || NEW.titre,
    '/travaux', 'travaux', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_travaux_assignee
AFTER INSERT OR UPDATE OF assigne_a ON public.travaux
FOR EACH ROW EXECUTE FUNCTION public.notify_travaux_assignee();

-- 7) Trigger reclamations
CREATE OR REPLACE FUNCTION public.notify_reclamation_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'reclamation_assignee', 'Réclamation assignée',
    _assigner || ' vous a assigné la réclamation : ' || NEW.titre,
    '/reclamations', 'reclamation', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_reclamation_assignee
AFTER INSERT OR UPDATE OF assigne_a ON public.reclamations
FOR EACH ROW EXECUTE FUNCTION public.notify_reclamation_assignee();

-- 8) Trigger commentaire activite
CREATE OR REPLACE FUNCTION public.notify_activite_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.activites WHERE id = NEW.activite_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'activite_comment', 'Nouveau commentaire',
    _author || ' a commenté la tâche : ' || COALESCE(_titre,''),
    '/calendrier', 'activite', NEW.activite_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_activite_comment
AFTER INSERT ON public.activite_commentaires
FOR EACH ROW EXECUTE FUNCTION public.notify_activite_comment();

-- 9) Trigger commentaire travaux
CREATE OR REPLACE FUNCTION public.notify_travaux_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.travaux WHERE id = NEW.travaux_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'travaux_comment', 'Nouveau commentaire',
    _author || ' a commenté les travaux : ' || COALESCE(_titre,''),
    '/travaux', 'travaux', NEW.travaux_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_travaux_comment
AFTER INSERT ON public.travaux_commentaires
FOR EACH ROW EXECUTE FUNCTION public.notify_travaux_comment();

-- 10) Trigger commentaire reclamations
CREATE OR REPLACE FUNCTION public.notify_reclamation_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.reclamations WHERE id = NEW.reclamation_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'reclamation_comment', 'Nouveau commentaire',
    _author || ' a commenté la réclamation : ' || COALESCE(_titre,''),
    '/reclamations', 'reclamation', NEW.reclamation_id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_reclamation_comment
AFTER INSERT ON public.reclamations_commentaires
FOR EACH ROW EXECUTE FUNCTION public.notify_reclamation_comment();
