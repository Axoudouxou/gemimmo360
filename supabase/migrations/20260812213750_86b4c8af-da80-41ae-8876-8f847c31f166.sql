-- 1. Historique impôts fonciers : plus d'insertion arbitraire
DROP POLICY IF EXISTS "Insert impots historique (system)" ON public.impots_fonciers_historique;
REVOKE INSERT, UPDATE, DELETE ON public.impots_fonciers_historique FROM authenticated;

-- 2. Storage réclamations : contrôle par rôle
DROP POLICY IF EXISTS "recl docs read" ON storage.objects;
DROP POLICY IF EXISTS "recl docs write" ON storage.objects;
DROP POLICY IF EXISTS "recl docs update" ON storage.objects;
DROP POLICY IF EXISTS "recl docs delete" ON storage.objects;

CREATE POLICY "recl docs read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reclamations-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','commercial','recouvrement'])));

CREATE POLICY "recl docs write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reclamations-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','commercial'])));

CREATE POLICY "recl docs update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'reclamations-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','commercial'])))
WITH CHECK (bucket_id = 'reclamations-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','commercial'])));

CREATE POLICY "recl docs delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reclamations-documents' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND p.role = ANY (ARRAY['admin','direction','juridique','gestion_locative','technique','commercial'])));

-- 3. search_path fixe sur les fonctions pgmq
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 4. Retirer l'exécution publique/anonyme des fonctions SECURITY DEFINER
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- Re-autoriser uniquement les fonctions appelées par l'application connectée
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_activite(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_christelle_kouassi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_juridique_assignee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notif_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mention(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_impaye_cloture(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification(uuid, text, text, text, text, text, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;