
-- ==== 1) Broaden RLS: juridique full access; impayes accessible to write roles ====
DROP POLICY IF EXISTS "Admins full access on impayes" ON public.impayes;
DROP POLICY IF EXISTS "direction_all_impayes" ON public.impayes;
DROP POLICY IF EXISTS "impayes_insert_recouvrement" ON public.impayes;
DROP POLICY IF EXISTS "impayes_select_recouvrement" ON public.impayes;
DROP POLICY IF EXISTS "impayes_update_recouvrement" ON public.impayes;

CREATE POLICY "impayes_select_all_but_attente" ON public.impayes
  FOR SELECT USING (NOT public.has_role(auth.uid(), 'en_attente'));

CREATE POLICY "impayes_insert_write_roles" ON public.impayes
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')
    OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial')
    OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique')
  );

CREATE POLICY "impayes_update_write_roles" ON public.impayes
  FOR UPDATE USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')
    OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial')
    OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique')
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction')
    OR public.has_role(auth.uid(),'recouvrement') OR public.has_role(auth.uid(),'commercial')
    OR public.has_role(auth.uid(),'gestion_locative') OR public.has_role(auth.uid(),'juridique')
  );

CREATE POLICY "impayes_delete_admin" ON public.impayes
  FOR DELETE USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

-- ==== 2) Juridique -> travaux/reclamations write access (same level as technique) ====
DROP POLICY IF EXISTS "recl_update" ON public.reclamations;
CREATE POLICY "recl_update" ON public.reclamations
  FOR UPDATE USING (
    (NOT public.has_role(auth.uid(), 'recouvrement'))
    AND (NOT public.has_role(auth.uid(), 'en_attente'))
    AND ((created_by = auth.uid())
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'direction')
      OR public.has_role(auth.uid(),'technique')
      OR public.has_role(auth.uid(),'juridique'))
  ) WITH CHECK (
    (NOT public.has_role(auth.uid(), 'recouvrement'))
    AND (NOT public.has_role(auth.uid(), 'en_attente'))
    AND ((created_by = auth.uid())
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'direction')
      OR public.has_role(auth.uid(),'technique')
      OR public.has_role(auth.uid(),'juridique'))
  );

-- Travaux: allow juridique full access
CREATE POLICY "travaux_juridique_full" ON public.travaux
  FOR ALL USING (public.has_role(auth.uid(),'juridique'))
  WITH CHECK (public.has_role(auth.uid(),'juridique'));

-- Transactions commerciales: allow juridique full access
CREATE POLICY "transactions_juridique_full" ON public.transactions_commerciales
  FOR ALL USING (public.has_role(auth.uid(),'juridique'))
  WITH CHECK (public.has_role(auth.uid(),'juridique'));

-- ==== 3) impayes_commentaires ====
CREATE TABLE public.impayes_commentaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impaye_id uuid NOT NULL REFERENCES public.impayes(id) ON DELETE CASCADE,
  auteur uuid NOT NULL,
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impayes_commentaires TO authenticated;
GRANT ALL ON public.impayes_commentaires TO service_role;
ALTER TABLE public.impayes_commentaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imp_comm_read" ON public.impayes_commentaires FOR SELECT
  USING (NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY "imp_comm_insert" ON public.impayes_commentaires FOR INSERT
  WITH CHECK (auteur = auth.uid() AND NOT public.has_role(auth.uid(),'en_attente'));
CREATE POLICY "imp_comm_update_own" ON public.impayes_commentaires FOR UPDATE
  USING (auteur = auth.uid()) WITH CHECK (auteur = auth.uid());
CREATE POLICY "imp_comm_delete" ON public.impayes_commentaires FOR DELETE
  USING (auteur = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'direction'));

CREATE INDEX idx_imp_comm_impaye ON public.impayes_commentaires(impaye_id, created_at);

-- ==== 4) impayes_statut_historique ====
CREATE TABLE public.impayes_statut_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impaye_id uuid NOT NULL REFERENCES public.impayes(id) ON DELETE CASCADE,
  ancien_statut text,
  nouveau_statut text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.impayes_statut_historique TO authenticated;
GRANT ALL ON public.impayes_statut_historique TO service_role;
ALTER TABLE public.impayes_statut_historique ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imp_hist_read" ON public.impayes_statut_historique FOR SELECT
  USING (NOT public.has_role(auth.uid(),'en_attente'));

CREATE OR REPLACE FUNCTION public.log_impaye_statut_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.impayes_statut_historique(impaye_id, ancien_statut, nouveau_statut, changed_by)
    VALUES (NEW.id, NULL, NEW.statut, auth.uid());
  ELSIF NEW.statut IS DISTINCT FROM OLD.statut THEN
    INSERT INTO public.impayes_statut_historique(impaye_id, ancien_statut, nouveau_statut, changed_by)
    VALUES (NEW.id, OLD.statut, NEW.statut, auth.uid());
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_impaye_statut_insert
AFTER INSERT ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.log_impaye_statut_change();

CREATE TRIGGER trg_log_impaye_statut_update
AFTER UPDATE OF statut ON public.impayes
FOR EACH ROW EXECUTE FUNCTION public.log_impaye_statut_change();

-- ==== 5) Notification link updates: include ?open=<id> for deep-linking ====
CREATE OR REPLACE FUNCTION public.notify_activite_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'activite_assignee', 'Nouvelle tâche assignée',
    _assigner || ' vous a assigné : ' || NEW.titre,
    '/calendrier?open=' || NEW.id::text, 'activite', NEW.id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_travaux_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'travaux_assignee', 'Travaux assignés',
    _assigner || ' vous a assigné les travaux : ' || NEW.titre,
    '/travaux?open=' || NEW.id::text, 'travaux', NEW.id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_reclamation_assignee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assigner text;
BEGIN
  IF NEW.assigne_a IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;
  IF NEW.assigne_a = COALESCE(NEW.created_by, auth.uid()) THEN RETURN NEW; END IF;
  _assigner := public.notif_display_name(COALESCE(NEW.created_by, auth.uid()));
  PERFORM public.dispatch_notification(
    NEW.assigne_a, 'reclamation_assignee', 'Réclamation assignée',
    _assigner || ' vous a assigné la réclamation : ' || NEW.titre,
    '/reclamations?open=' || NEW.id::text, 'reclamation', NEW.id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_activite_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.activites WHERE id = NEW.activite_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'activite_comment', 'Nouveau commentaire',
    _author || ' a commenté la tâche : ' || COALESCE(_titre,''),
    '/calendrier?open=' || NEW.activite_id::text, 'activite', NEW.activite_id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_travaux_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.travaux WHERE id = NEW.travaux_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'travaux_comment', 'Nouveau commentaire',
    _author || ' a commenté les travaux : ' || COALESCE(_titre,''),
    '/travaux?open=' || NEW.travaux_id::text, 'travaux', NEW.travaux_id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_reclamation_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _assignee uuid; _titre text; _author text;
BEGIN
  SELECT assigne_a, titre INTO _assignee, _titre FROM public.reclamations WHERE id = NEW.reclamation_id;
  IF _assignee IS NULL OR _assignee = NEW.auteur THEN RETURN NEW; END IF;
  _author := public.notif_display_name(NEW.auteur);
  PERFORM public.dispatch_notification(
    _assignee, 'reclamation_comment', 'Nouveau commentaire',
    _author || ' a commenté la réclamation : ' || COALESCE(_titre,''),
    '/reclamations?open=' || NEW.reclamation_id::text, 'reclamation', NEW.reclamation_id
  );
  RETURN NEW;
END $$;

-- ==== 6) RPC for mention notifications (callable by authenticated users) ====
CREATE OR REPLACE FUNCTION public.notify_mention(
  _user_id uuid, _title text, _message text, _link text,
  _entity_type text, _entity_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _user_id IS NULL OR _user_id = auth.uid() THEN RETURN; END IF;
  PERFORM public.dispatch_notification(
    _user_id, 'mention', COALESCE(_title,'Vous avez été mentionné'),
    _message, _link, _entity_type, _entity_id
  );
END $$;

REVOKE ALL ON FUNCTION public.notify_mention(uuid, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_mention(uuid, text, text, text, text, uuid) TO authenticated;
