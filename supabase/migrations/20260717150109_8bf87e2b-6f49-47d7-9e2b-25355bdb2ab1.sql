DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.travaux'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%statut%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.travaux DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.travaux
  ADD CONSTRAINT travaux_statut_check
  CHECK (statut IN ('planifie', 'en_cours', 'termine', 'en_attente_validation', 'valide', 'refuse'));