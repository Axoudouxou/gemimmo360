import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "direction", label: "Direction" },
  { key: "recouvrement", label: "Finance" },
  { key: "gestion_locative", label: "Gestion loc." },
  { key: "commercial", label: "Commercial" },
  { key: "technico_commercial", label: "Technico-com." },
  { key: "technique", label: "Technique" },
  { key: "juridique", label: "Juridique" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];
export type Level = "full" | "read" | "none";

export const ALL_ROLES: RoleKey[] = ROLES.map((r) => r.key);

function perms(full: RoleKey[], read: RoleKey[] = []): Record<RoleKey, Level> {
  return Object.fromEntries(
    ALL_ROLES.map((r) => [r, full.includes(r) ? "full" : read.includes(r) ? "read" : "none"]),
  ) as Record<RoleKey, Level>;
}

const FINANCE_WRITE: RoleKey[] = ["admin", "direction", "recouvrement", "gestion_locative"];
const NON_RECOUVREMENT: RoleKey[] = [
  "admin",
  "direction",
  "juridique",
  "gestion_locative",
  "technique",
  "commercial",
  "technico_commercial",
];

export type MatrixRow = {
  key: string;
  action: string;
  note?: string;
  access: Record<RoleKey, Level>;
};

export type MatrixSection = { title: string; rows: MatrixRow[] };

export const DEFAULT_SECTIONS: MatrixSection[] = [
  {
    title: "Impayés & paiements",
    rows: [
      { key: "finance.read", action: "Consulter les impayés et la situation locative", access: perms([], ALL_ROLES) },
      { key: "finance.quittance", action: "Émettre / rééditer une quittance", access: perms(FINANCE_WRITE) },
      {
        key: "finance.echeance_write",
        action: "Saisir / modifier un impayé",
        note: "Période obligatoire, doublon contrat + mois refusé",
        access: perms(FINANCE_WRITE),
      },
      {
        key: "finance.paiement_write",
        action: "Enregistrer un paiement et l'affecter",
        note: "Affectation manuelle ligne par ligne",
        access: perms(FINANCE_WRITE),
      },
      {
        key: "finance.reaffectation",
        action: "Réaffecter un paiement déjà enregistré",
        note: "Tracé dans l'historique des affectations",
        access: perms(["admin", "direction"]),
      },
      {
        key: "finance.echeance_delete",
        action: "Supprimer un impayé",
        note: "Interdit si des paiements y sont affectés",
        access: perms(["admin", "direction"]),
      },
      {
        key: "finance.archive",
        action: "Impayés (archive, ancien module)",
        access: perms([], ["admin"]),
      },
    ],
  },
  {
    title: "Gestion locative",
    rows: [
      { key: "locatif.base", action: "Consulter biens, lots, contacts et contrats", access: perms([], ALL_ROLES) },
      { key: "locatif.contrat_create", action: "Créer un contrat (liste ou fiche lot)", access: perms(["admin", "direction", "juridique", "gestion_locative"]) },
      { key: "locatif.contrat_edit", action: "Modifier un contrat / mettre fin au bail", access: perms(ALL_ROLES) },
      { key: "locatif.edl", action: "États des lieux (+ documents PDF)", access: perms(NON_RECOUVREMENT) },
      {
        key: "locatif.charges",
        action: "Créer / modifier des charges",
        access: perms([
          "admin",
          "direction",
          "gestion_locative",
          "commercial",
          "technico_commercial",
          "recouvrement",
        ], ["technique", "juridique"]),
      },
      { key: "locatif.decompte_generate", action: "Générer un décompte propriétaire (Word / Excel)", access: perms(FINANCE_WRITE) },
      {
        key: "locatif.transactions",
        action: "Créer / modifier une transaction commerciale",
        note: "Commercial et Technico-commercial : leurs transactions uniquement. Juridique : statut et notes uniquement (ligne suivante).",
        access: perms(["admin", "direction", "commercial", "technico_commercial"]),
      },
      { key: "locatif.transaction_read", action: "Consulter les transactions", note: "Commercial et Technico-commercial : leurs transactions uniquement. Juridique : toutes les transactions.", access: perms([], ["admin", "direction", "commercial", "technico_commercial", "juridique"]) },
      { key: "locatif.transaction_legal", action: "Transactions : modifier uniquement le statut et les notes", note: "Juridique : aucune création ni suppression. Commercial et Technico-commercial : leurs transactions uniquement.", access: perms(["admin", "direction", "commercial", "technico_commercial", "juridique"]) },
      { key: "locatif.transaction_delete", action: "Supprimer une transaction", note: "Commercial et Technico-commercial : leurs transactions uniquement.", access: perms(["admin", "direction", "commercial", "technico_commercial"]) },
      {
        key: "locatif.fiscalite",
        action: "Fiscalité (impôt foncier, honoraires)",
        access: perms(["admin", "direction", "juridique"]),
      },
    ],
  },
  {
    title: "Travaux & réclamations",
    rows: [
      { key: "technique.read", action: "Consulter travaux et réclamations", access: perms([], ALL_ROLES) },
      {
        key: "technique.travaux_write",
        action: "Créer / modifier des travaux",
        note: "Selon les droits de la fiche ; Finance en consultation seule.",
        access: perms(
          ["admin", "direction", "juridique", "gestion_locative", "technique", "technico_commercial", "commercial"],
          ["recouvrement"],
        ),
      },
      {
        key: "technique.reclamation_write",
        action: "Créer / modifier une réclamation",
        note: "Selon les droits de la fiche ; Finance sans accès au module.",
        access: perms(
          ["admin", "direction", "gestion_locative", "technique", "technico_commercial", "commercial", "juridique"],
        ),
      },
      {
        key: "technique.documents",
        action: "Joindre / supprimer des documents (travaux, réclamations, contrats)",
        note: "Recouvrement : documents des travaux uniquement (devis PDF)",
        access: perms([
          "admin",
          "direction",
          "juridique",
          "gestion_locative",
          "technique",
          "technico_commercial",
          "commercial",
          "recouvrement",
        ]),
      },
    ],
  },
  {
    title: "Activités & administration",
    rows: [
      { key: "admin.activites", action: "Calendrier, tâches, commentaires, mentions", access: perms(ALL_ROLES) },
      { key: "admin.import", action: "Import CSV", access: perms(["admin"]) },
      { key: "admin.doublons", action: "Fusion de doublons", access: perms(["admin"]) },
      { key: "admin.utilisateurs", action: "Gestion des utilisateurs et des rôles", access: perms(["admin"]) },
      {
        key: "admin.matrice",
        action: "Matrice des accès (consulter et modifier)",
        access: perms(["admin"]),
      },
    ],
  },
];

export type Overrides = Record<string, Partial<Record<RoleKey, Level>>>;

// Only this action is currently enforced through the configurable matrix.
// Other rows report their real role guards, not ineffective stored overrides.
export const isConfigurableAction = (key: string) => key === "finance.echeance_write";

export async function fetchOverrides(): Promise<Overrides> {
  const { data } = await supabase.from("permissions_overrides").select("action_key, role, level");
  const out: Overrides = {};
  for (const row of data ?? []) {
    const key = row.action_key as string;
    out[key] = out[key] ?? {};
    const entry = out[key];
    if (entry) entry[row.role as RoleKey] = row.level as Level;
  }
  return out;
}

export function levelFor(
  overrides: Overrides,
  actionKey: string,
  role: string | null | undefined,
): Level {
  if (!role) return "none";
  const ov = isConfigurableAction(actionKey) ? overrides[actionKey]?.[role as RoleKey] : undefined;
  if (ov) return ov;
  const row = DEFAULT_SECTIONS.flatMap((s) => s.rows).find((r) => r.key === actionKey);
  return row?.access[role as RoleKey] ?? "none";
}

/** Reads the (possibly customised) access level of the current role for an action. */
export function useAccessLevel(actionKey: string, role: string | null | undefined) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchOverrides()
      .then((o) => alive && setOverrides(o))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const level = levelFor(overrides, actionKey, role);
  return { level, canWrite: level === "full", canRead: level !== "none", loading, overrides };
}
