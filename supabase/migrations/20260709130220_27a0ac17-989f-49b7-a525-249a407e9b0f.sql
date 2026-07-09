ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role = ANY (ARRAY['admin'::text, 'direction'::text, 'gestion_locative'::text, 'recouvrement'::text, 'technique'::text, 'juridique'::text, 'commercial'::text]));