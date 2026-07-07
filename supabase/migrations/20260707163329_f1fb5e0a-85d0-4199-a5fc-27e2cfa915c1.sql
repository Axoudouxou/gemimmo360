
-- Security definer function to check role without recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;

-- Admin can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update all profiles (including role)
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Prevent non-admins from escalating their own role
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change user roles';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();
