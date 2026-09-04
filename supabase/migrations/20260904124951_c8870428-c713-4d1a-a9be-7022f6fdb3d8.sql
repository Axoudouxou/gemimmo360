CREATE TABLE public.permissions_overrides (
  action_key text NOT NULL,
  role text NOT NULL,
  level text NOT NULL CHECK (level IN ('full','read','none')),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_key, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions_overrides TO authenticated;
GRANT ALL ON public.permissions_overrides TO service_role;

ALTER TABLE public.permissions_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_overrides_select" ON public.permissions_overrides
FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_overrides_write" ON public.permissions_overrides
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'));