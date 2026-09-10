create policy fisc_honoraires_select_recouvrement on public.honoraires_fiscaux
for select to authenticated
using (has_role(auth.uid(), 'recouvrement') or has_role(auth.uid(), 'gestion_locative') or is_christelle_kouassi());