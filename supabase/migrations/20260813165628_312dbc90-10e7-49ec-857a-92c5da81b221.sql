UPDATE public.activites SET statut = 'terminee' WHERE statut IN ('fait','realisee');

ALTER TABLE public.activites
  ADD CONSTRAINT activites_statut_check
  CHECK (statut IN ('a_faire','planifiee','en_cours','terminee','annulee'));