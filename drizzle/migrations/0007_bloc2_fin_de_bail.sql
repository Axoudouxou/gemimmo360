ALTER TABLE public.contacts DROP CONSTRAINT contacts_type_contact_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_type_contact_check CHECK (type_contact = ANY (ARRAY['bailleur','locataire','ancien_locataire','prospect','prestataire']));

CREATE TABLE public.reglages_fin_bail (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  technique_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finance_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reglages_fin_bail TO authenticated;
GRANT ALL ON public.reglages_fin_bail TO service_role;
ALTER TABLE public.reglages_fin_bail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin lit réglages fin de bail" ON public.reglages_fin_bail FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin crée réglages fin de bail" ON public.reglages_fin_bail FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin modifie réglages fin de bail" ON public.reglages_fin_bail FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Un ancien locataire qui signe un nouveau contrat actif redevient locataire
CREATE OR REPLACE FUNCTION public.reactiver_ancien_locataire() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut = 'actif' AND NEW.locataire_id IS NOT NULL THEN
    UPDATE public.contacts SET type_contact = 'locataire' WHERE id = NEW.locataire_id AND type_contact = 'ancien_locataire';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reactiver_ancien_locataire AFTER INSERT OR UPDATE OF statut, locataire_id ON public.contrats FOR EACH ROW EXECUTE FUNCTION public.reactiver_ancien_locataire();

CREATE OR REPLACE FUNCTION public.terminer_bail_atomique(_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid:=auth.uid(); _c public.contrats%ROWTYPE; _lot public.lots%ROWTYPE; _loc public.contacts%ROWTYPE; _bien public.biens%ROWTYPE; _tech uuid; _finance uuid; _fin date:=(_payload->>'date_fin')::date; _nom text; _lieu text;
BEGIN
 IF _uid IS NULL OR NOT public.is_staff_actif() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 SELECT * INTO _c FROM public.contrats WHERE id=(_payload->>'contrat_id')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;
 SELECT * INTO _lot FROM public.lots WHERE id=_c.lot_id FOR UPDATE;
 SELECT * INTO _c FROM public.contrats WHERE id=_c.id FOR UPDATE;
 IF _c.statut='resilie' THEN RETURN jsonb_build_object('ok',true); END IF;
 IF _fin IS NULL THEN RAISE EXCEPTION 'Date de fin obligatoire'; END IF;
 SELECT * INTO _loc FROM public.contacts WHERE id=_c.locataire_id;
 SELECT * INTO _bien FROM public.biens WHERE id=_lot.bien_id;
 SELECT r.technique_user_id, r.finance_user_id INTO _tech, _finance FROM public.reglages_fin_bail r WHERE r.id = 1;
 IF _tech IS NULL THEN SELECT id INTO _tech FROM public.profiles WHERE role IN ('technique','technico_commercial') LIMIT 1; END IF;
 IF _finance IS NULL THEN SELECT id INTO _finance FROM public.profiles WHERE role='recouvrement' LIMIT 1; END IF;
 IF _tech IS NULL OR _finance IS NULL THEN RAISE EXCEPTION 'Impossible de créer les tâches : un destinataire Technique et Finance est nécessaire'; END IF;
 _nom:=coalesce(_loc.nom,'locataire')||CASE WHEN _loc.type_entite='entreprise' OR _loc.prenom IS NULL THEN '' ELSE ' '||_loc.prenom END;
 _lieu:=coalesce(_bien.titre,'bien')||coalesce(' – '||_lot.label,'');
 UPDATE public.contrats SET statut='resilie',date_fin=_fin WHERE id=_c.id;
 UPDATE public.lots SET statut='vacant' WHERE id=_lot.id AND NOT EXISTS(SELECT 1 FROM public.contrats WHERE lot_id=_lot.id AND statut='actif');
 IF _c.locataire_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contrats WHERE locataire_id=_c.locataire_id AND statut='actif' AND id<>_c.id) THEN
   UPDATE public.contacts SET type_contact='ancien_locataire' WHERE id=_c.locataire_id AND type_contact='locataire';
 END IF;
 INSERT INTO public.activites(titre,type_activite,priorite,statut,date_debut,assigne_a,created_by,contrat_id,bien_id,lot_id) VALUES
 ('État des lieux de sortie – '||_nom||' – '||_lieu,'etat_des_lieux','urgente','a_faire',_fin,_tech,_uid,_c.id,_lot.bien_id,_lot.id),
 ('Décompte de sortie et remboursement caution – '||_nom||' – '||_lieu||' – Caution : '||coalesce(_c.depot_garantie::text||' FCFA','montant non renseigné'),'tache','normale','a_faire',_fin+45,_finance,_uid,_c.id,_lot.bien_id,_lot.id);
 RETURN jsonb_build_object('ok',true);
END $function$;