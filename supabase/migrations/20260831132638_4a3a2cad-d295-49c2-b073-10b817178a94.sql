ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin','direction','gestion_locative','recouvrement','technique','juridique','commercial','technico_commercial','en_attente','inactif'])) NOT VALID;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        p.role = _role
        OR (p.role = 'technico_commercial' AND _role IN ('technique','commercial'))
      )
  )
$function$;