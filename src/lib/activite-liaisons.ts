import { supabase } from "@/integrations/supabase/client";

/** Co-assignés (en plus du responsable principal) d'une activité. */
export async function fetchAssignesSupp(activiteId: string): Promise<string[]> {
  const { data } = await supabase
    .from("activite_assignes")
    .select("user_id")
    .eq("activite_id", activiteId);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

/** Biens liés (multi) à une activité. */
export async function fetchBiensLies(activiteId: string): Promise<string[]> {
  const { data } = await supabase
    .from("activite_biens")
    .select("bien_id")
    .eq("activite_id", activiteId);
  return ((data ?? []) as Array<{ bien_id: string }>).map((r) => r.bien_id);
}

/** Identifiants des activités où l'utilisateur est co-assigné. */
export async function fetchActiviteIdsForUser(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("activite_assignes")
    .select("activite_id")
    .eq("user_id", userId);
  return ((data ?? []) as Array<{ activite_id: string }>).map((r) => r.activite_id);
}

async function sync(
  table: "activite_assignes" | "activite_biens",
  column: "user_id" | "bien_id",
  activiteId: string,
  wanted: string[],
) {
  const uniq = Array.from(new Set(wanted.filter(Boolean)));
  const { data } = await supabase.from(table).select(`id, ${column}`).eq("activite_id", activiteId);
  const current = (data ?? []) as Array<Record<string, string>>;
  const currentIds = current.map((r) => r[column] as string);

  const toAdd = uniq.filter((v) => !currentIds.includes(v));
  const toRemoveRowIds = current.filter((r) => !uniq.includes(r[column] as string)).map((r) => r.id);

  if (toAdd.length > 0) {
    await supabase
      .from(table)
      .insert(toAdd.map((v) => ({ activite_id: activiteId, [column]: v })) as never);
  }
  if (toRemoveRowIds.length > 0) {
    await supabase.from(table).delete().in("id", toRemoveRowIds);
  }
}

/** Remplace la liste des co-assignés par celle fournie. */
export function syncAssignes(activiteId: string, userIds: string[]) {
  return sync("activite_assignes", "user_id", activiteId, userIds);
}

/** Remplace la liste des biens liés par celle fournie. */
export function syncBiensLies(activiteId: string, bienIds: string[]) {
  return sync("activite_biens", "bien_id", activiteId, bienIds);
}
