ALTER TABLE public.activites ADD COLUMN IF NOT EXISTS archive boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS activites_archive_idx ON public.activites(archive);