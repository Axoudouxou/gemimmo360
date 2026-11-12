CREATE TABLE public.module_access (
  module text NOT NULL,
  role text NOT NULL,
  level text NOT NULL CHECK (level IN ('full','read','none')),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_access TO authenticated;
GRANT ALL ON public.module_access TO service_role;
ALTER TABLE public.module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit la matrice modules" ON public.module_access FOR SELECT TO authenticated USING (public.is_staff_actif());
CREATE POLICY "Admin gere la matrice modules" ON public.module_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin') AND role <> 'admin');

-- Niveau du module pour l'utilisateur courant. Sans réglage : 'full' (les règles habituelles s'appliquent). L'admin a toujours tout.
CREATE OR REPLACE FUNCTION public.module_level(_module text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN p.role = 'admin' THEN 'full'
    ELSE COALESCE((SELECT m.level FROM public.module_access m WHERE m.module=_module AND m.role=p.role), 'full') END
  FROM public.profiles p WHERE p.id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.module_level(text) TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('biens','biens',false),('biens','lots',false),
    ('contacts','contacts',false),
    ('contrats','contrats',false),
    ('impayes','echeances',false),('impayes','paiements',false),('impayes','affectations',false),('impayes','quittances',false),
    ('charges','charges',true),
    ('transactions','transactions_commerciales',true),
    ('travaux','travaux',true),('travaux','travaux_commentaires',true),('travaux','travaux_devis_complementaires',true),
    ('reclamations','reclamations',true),('reclamations','reclamations_commentaires',true),
    ('etats_des_lieux','etats_des_lieux',true),
    ('fiscalite','impots_fonciers',true),('fiscalite','honoraires_fiscaux',true),
    ('activites','activites',false),('activites','activite_commentaires',false)
  ) AS t(module, tbl, bloque_lecture)
  LOOP
    EXECUTE format('CREATE POLICY "Matrice %1$s insert" ON public.%2$I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.module_level(%1$L) = ''full'')', r.module, r.tbl);
    EXECUTE format('CREATE POLICY "Matrice %1$s update" ON public.%2$I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.module_level(%1$L) = ''full'')', r.module, r.tbl);
    EXECUTE format('CREATE POLICY "Matrice %1$s delete" ON public.%2$I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.module_level(%1$L) = ''full'')', r.module, r.tbl);
    IF r.bloque_lecture THEN
      EXECUTE format('CREATE POLICY "Matrice %1$s select" ON public.%2$I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.module_level(%1$L) <> ''none'')', r.module, r.tbl);
    END IF;
  END LOOP;
END $$;