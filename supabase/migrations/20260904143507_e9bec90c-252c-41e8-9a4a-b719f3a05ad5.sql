CREATE TABLE public.quittance_sequence (
  annee integer PRIMARY KEY,
  dernier_numero integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.quittance_sequence TO authenticated;
GRANT ALL ON public.quittance_sequence TO service_role;
ALTER TABLE public.quittance_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture compteur quittances" ON public.quittance_sequence
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/direction gerent le compteur" ON public.quittance_sequence
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'));

GRANT INSERT, UPDATE, DELETE ON public.quittance_sequence TO authenticated;

CREATE TABLE public.quittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  echeance_id uuid NOT NULL REFERENCES public.echeances(id) ON DELETE CASCADE,
  contrat_id uuid NOT NULL REFERENCES public.contrats(id) ON DELETE CASCADE,
  annee integer NOT NULL,
  numero integer NOT NULL,
  numero_affiche text NOT NULL,
  periode date NOT NULL,
  montant numeric NOT NULL,
  date_reglement date NOT NULL,
  mode_reglement text,
  locataire text,
  bien text,
  lot text,
  emise_par uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (echeance_id),
  UNIQUE (annee, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quittances TO authenticated;
GRANT ALL ON public.quittances TO service_role;
ALTER TABLE public.quittances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des quittances" ON public.quittances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Emission des quittances" ON public.quittances
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'direction')
    OR public.has_role(auth.uid(), 'recouvrement')
    OR public.has_role(auth.uid(), 'gestion_locative')
  );
CREATE POLICY "Mise a jour des quittances" ON public.quittances
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'));
CREATE POLICY "Suppression des quittances" ON public.quittances
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'direction'));

CREATE TRIGGER update_quittances_updated_at
  BEFORE UPDATE ON public.quittances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.quittance_sequence (annee, dernier_numero)
VALUES (date_part('year', now())::int, 20406)
ON CONFLICT (annee) DO NOTHING;

CREATE OR REPLACE FUNCTION public.emettre_quittance(
  _echeance_id uuid,
  _date_reglement date,
  _mode_reglement text,
  _locataire text,
  _bien text,
  _lot text
) RETURNS public.quittances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _e public.echeances%ROWTYPE;
  _q public.quittances%ROWTYPE;
  _annee integer;
  _num integer;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'direction')
    OR public.has_role(auth.uid(), 'recouvrement')
    OR public.has_role(auth.uid(), 'gestion_locative')
  ) THEN
    RAISE EXCEPTION 'Non autorise a emettre une quittance';
  END IF;

  SELECT * INTO _e FROM public.echeances WHERE id = _echeance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Echeance introuvable';
  END IF;
  IF COALESCE(_e.montant_affecte, 0) < COALESCE(_e.montant_du, 0) OR COALESCE(_e.montant_du, 0) <= 0 THEN
    RAISE EXCEPTION 'La periode n''est pas integralement soldee';
  END IF;

  SELECT * INTO _q FROM public.quittances WHERE echeance_id = _echeance_id;
  IF FOUND THEN
    RETURN _q;
  END IF;

  _annee := date_part('year', COALESCE(_date_reglement, CURRENT_DATE))::int;

  INSERT INTO public.quittance_sequence (annee, dernier_numero)
  VALUES (_annee, 0)
  ON CONFLICT (annee) DO NOTHING;

  UPDATE public.quittance_sequence
     SET dernier_numero = dernier_numero + 1, updated_at = now()
   WHERE annee = _annee
  RETURNING dernier_numero INTO _num;

  INSERT INTO public.quittances (
    echeance_id, contrat_id, annee, numero, numero_affiche, periode, montant,
    date_reglement, mode_reglement, locataire, bien, lot, emise_par
  ) VALUES (
    _echeance_id, _e.contrat_id, _annee, _num, lpad(_num::text, 7, '0') || ' / ' || _annee::text,
    _e.periode, _e.montant_du, COALESCE(_date_reglement, CURRENT_DATE), _mode_reglement,
    _locataire, _bien, _lot, auth.uid()
  ) RETURNING * INTO _q;

  RETURN _q;
END;
$$;

REVOKE ALL ON FUNCTION public.emettre_quittance(uuid, date, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.emettre_quittance(uuid, date, text, text, text, text) TO authenticated;