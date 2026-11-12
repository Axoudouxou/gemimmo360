export const CONTRACT_CREATE_ROLES = ["admin", "direction", "juridique", "gestion_locative"] as const;
export const STATUTS_LOT = [
  { value: "vacant", label: "Vacant" },
  { value: "loue", label: "Loué" },
  { value: "en_travaux", label: "En travaux" },
  { value: "vendu", label: "Vendu" },
] as const;
export const lotStatutLabel = (statut: string) => STATUTS_LOT.find((s) => s.value === statut)?.label ?? statut;
export const canCreateContract = (role: string | null | undefined) =>
  CONTRACT_CREATE_ROLES.some((allowed) => allowed === role);
export const canGenerateDecompte = (role: string | null | undefined) =>
  ["admin", "direction", "gestion_locative", "recouvrement"].some((allowed) => allowed === role);
export const isLegalTransactionRole = (role: string | null | undefined) => role === "juridique";
/** Coût d'un travail au décompte : coût réel s'il est renseigné, sinon coût estimé. */
export const coutTravail = (t: { budget_depense: number | null; budget_prevu: number | null }) =>
  Number(t.budget_depense) > 0
    ? { montant: Number(t.budget_depense), libelle: "coût réel" }
    : { montant: Number(t.budget_prevu) || 0, libelle: "coût estimé" };

/** Une charge récurrente (pas en mois : 1, 3 ou 12) tombe-t-elle sur le mois mk (AAAA-MM) ? */
export const recurrenceTombeCeMois = (debut: string, mk: string, pas: number) => {
  const [ya, ma] = debut.split("-").map(Number) as [number, number];
  const [yb, mb] = mk.split("-").map(Number) as [number, number];
  const ecart = (yb - ya) * 12 + (mb - ma);
  return ecart >= 0 && ecart % pas === 0;
};
