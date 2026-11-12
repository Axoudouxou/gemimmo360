CREATE TABLE public.decomptes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id uuid NOT NULL REFERENCES public.biens(id),
  periodicite text NOT NULL CHECK (periodicite IN ('mois','trimestre')),
  periode_debut date NOT NULL,
  annee integer NOT NULL,
  numero integer NOT NULL,
  numero_affiche text NOT NULL,
  donnees jsonb NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bien_id, periodicite, periode_debut),
  UNIQUE (annee, numero)
);
GRANT SELECT ON public.decomptes TO authenticated;
GRANT ALL ON public.decomptes TO service_role;
ALTER TABLE public.decomptes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lit les decomptes" ON public.decomptes FOR SELECT TO authenticated USING (public.is_staff_actif());

CREATE TABLE public.decompte_sequence (annee integer PRIMARY KEY, dernier_numero integer NOT NULL DEFAULT 0);
GRANT ALL ON public.decompte_sequence TO service_role;
ALTER TABLE public.decompte_sequence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enregistrer_decompte(_bien_id uuid, _periodicite text, _periode_debut date, _donnees jsonb, _charge_ids uuid[])
RETURNS public.decomptes LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _d public.decomptes; _annee int; _num int; _fin date;
BEGIN
  IF NOT public.is_staff_actif() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('decompte:' || _bien_id || _periodicite || _periode_debut));
  SELECT * INTO _d FROM public.decomptes WHERE bien_id=_bien_id AND periodicite=_periodicite AND periode_debut=_periode_debut;
  IF FOUND THEN RETURN _d; END IF;
  _annee := extract(year FROM _periode_debut)::int;
  INSERT INTO public.decompte_sequence(annee, dernier_numero) VALUES (_annee, 1)
    ON CONFLICT (annee) DO UPDATE SET dernier_numero = decompte_sequence.dernier_numero + 1
    RETURNING dernier_numero INTO _num;
  INSERT INTO public.decomptes(bien_id, periodicite, periode_debut, annee, numero, numero_affiche, donnees, created_by)
  VALUES (_bien_id, _periodicite, _periode_debut, _annee, _num, lpad(_num::text,4,'0') || ' / ' || _annee, _donnees, auth.uid())
  RETURNING * INTO _d;
  _fin := (_periode_debut + CASE WHEN _periodicite='trimestre' THEN interval '3 months' ELSE interval '1 month' END)::date;
  UPDATE public.charges SET statut_imputation='imputee', decompte_mois=date_trunc('month', mois_rattachement)::date, updated_at=now()
   WHERE id = ANY(COALESCE(_charge_ids, '{}')) AND bien_id=_bien_id AND statut_imputation <> 'imputee'
     AND mois_rattachement >= _periode_debut AND mois_rattachement < _fin;
  RETURN _d;
END $$;
REVOKE ALL ON FUNCTION public.enregistrer_decompte(uuid,text,date,jsonb,uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enregistrer_decompte(uuid,text,date,jsonb,uuid[]) TO authenticated;