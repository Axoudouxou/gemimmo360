UPDATE public.activites SET statut = 'a_faire' WHERE statut = 'planifiee';
ALTER TABLE public.activites DROP CONSTRAINT IF EXISTS activites_statut_check;
ALTER TABLE public.activites ADD CONSTRAINT activites_statut_check CHECK (statut = ANY (ARRAY['a_faire'::text, 'en_cours'::text, 'terminee'::text, 'annulee'::text]));