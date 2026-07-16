
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
      url := _site || '/lovable/email/transactional/send',
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
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;
