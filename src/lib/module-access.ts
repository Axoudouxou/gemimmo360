import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Level } from "@/lib/permissions-matrix";

/** Modules pilotables par l'administrateur. Sans réglage : accès habituel du rôle. */
export const MODULES = [
  { key: "biens", label: "Biens et lots", paths: ["/biens", "/lots"] },
  { key: "contacts", label: "Contacts", paths: ["/contacts"] },
  { key: "contrats", label: "Contrats", paths: ["/contrats"] },
  { key: "etats_des_lieux", label: "États des lieux", paths: ["/etats-des-lieux"] },
  { key: "impayes", label: "Impayés, paiements et quittances", paths: ["/echeances"] },
  { key: "charges", label: "Charges et décomptes", paths: ["/charges"] },
  { key: "transactions", label: "Transactions", paths: ["/transactions"] },
  { key: "fiscalite", label: "Fiscalité", paths: ["/fiscalite"] },
  { key: "travaux", label: "Travaux", paths: ["/travaux"] },
  { key: "reclamations", label: "Réclamations", paths: ["/reclamations"] },
  { key: "activites", label: "Calendrier et tâches", paths: ["/calendrier", "/taches"] },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export type ModuleMatrix = Record<string, Record<string, Level>>;

export async function fetchModuleMatrix(): Promise<ModuleMatrix> {
  const { data } = await supabase.from("module_access").select("module, role, level");
  const out: ModuleMatrix = {};
  for (const r of data ?? []) (out[r.module] ??= {})[r.role] = r.level as Level;
  return out;
}

export function moduleLevel(m: ModuleMatrix, module: string, role: string): Level {
  if (role === "admin") return "full";
  return m[module]?.[role] ?? "full";
}

export function moduleForPath(path: string) {
  return MODULES.find((m) => m.paths.some((p) => path === p || path.startsWith(p + "/")));
}

/** Matrice + rôle courant, rechargés à chaque montage. */
export function useModuleAccess() {
  const [matrix, setMatrix] = useState<ModuleMatrix>({});
  const [role, setRole] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
        setRole(p?.role ?? "");
      }
      setMatrix(await fetchModuleMatrix());
      setReady(true);
    })();
  }, []);
  return { matrix, role, ready, levelOf: (mod: string) => moduleLevel(matrix, mod, role) };
}
