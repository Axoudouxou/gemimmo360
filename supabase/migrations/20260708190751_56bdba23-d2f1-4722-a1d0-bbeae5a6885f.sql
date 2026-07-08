ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS archive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fusionne_avec_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_archive_idx ON public.contacts(archive);
CREATE INDEX IF NOT EXISTS contacts_fusionne_avec_id_idx ON public.contacts(fusionne_avec_id);