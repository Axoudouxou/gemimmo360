-- 1. Add source + id_externe to contacts and biens
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'saisie_directe'
    CHECK (source IN ('obelix', 'import_manuel', 'saisie_directe')),
  ADD COLUMN IF NOT EXISTS id_externe text;

ALTER TABLE public.biens
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'saisie_directe'
    CHECK (source IN ('obelix', 'import_manuel', 'saisie_directe')),
  ADD COLUMN IF NOT EXISTS id_externe text;

-- 2. imports table
CREATE TABLE public.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_import text NOT NULL CHECK (type_import IN ('contacts', 'biens')),
  nom_fichier text NOT NULL,
  nombre_lignes integer NOT NULL DEFAULT 0,
  nombre_succes integer NOT NULL DEFAULT 0,
  nombre_erreurs integer NOT NULL DEFAULT 0,
  importe_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to imports"
  ON public.imports
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
