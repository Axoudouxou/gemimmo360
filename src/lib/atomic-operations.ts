import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type Operation = "creer_contrat_atomique" | "enregistrer_paiement_atomique" | "reaffecter_paiement_atomique" | "generer_quittances_atomique" | "terminer_bail_atomique";
/** Additive RPCs are kept separate from the generated client types until regeneration. */
export async function atomicOperation<T>(operation: Operation, payload: Json): Promise<T> {
  const client = supabase as unknown as {
    rpc: (name: Operation, args: { _payload: Json }) => Promise<{ data: T | null; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(operation, { _payload: payload });
  if (error) throw new Error(`Enregistrement annulé : ${error.message}`);
  if (data === null) throw new Error("Enregistrement non confirmé. Vérifiez votre connexion avant de réessayer.");
  return data;
}