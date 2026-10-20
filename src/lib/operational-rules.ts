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