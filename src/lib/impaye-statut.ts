export type ImpayeStatutKey =
  | "solde"
  | "juridique"
  | "partiel"
  | "relance"
  | "retard"
  | "a_jour";

export const JURIDIQUE_ETAPES = [
  "transfere_juridique",
  "mise_en_demeure",
  "procedure_judiciaire",
] as const;

export type ImpayeStatutInfo = {
  key: ImpayeStatutKey;
  label: string;
  emoji: string;
  className: string;
};

const INFOS: Record<ImpayeStatutKey, ImpayeStatutInfo> = {
  solde: {
    key: "solde",
    label: "Soldé",
    emoji: "🟢",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white",
  },
  juridique: {
    key: "juridique",
    label: "Transféré au juridique",
    emoji: "⚖️",
    className: "bg-purple-600 hover:bg-purple-600 text-white",
  },
  partiel: {
    key: "partiel",
    label: "Paiement partiel",
    emoji: "🟡",
    className: "bg-yellow-500 hover:bg-yellow-500 text-black",
  },
  relance: {
    key: "relance",
    label: "Relance envoyée",
    emoji: "🟠",
    className: "bg-orange-500 hover:bg-orange-500 text-white",
  },
  retard: {
    key: "retard",
    label: "En retard",
    emoji: "🔴",
    className: "bg-destructive hover:bg-destructive text-destructive-foreground",
  },
  a_jour: {
    key: "a_jour",
    label: "À jour",
    emoji: "⚪",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
};

export function computeImpayeStatut(i: {
  statut: string;
  etape_traitement?: string | null;
  montant_du: number | string;
  montant_paye: number | string;
}): ImpayeStatutInfo {
  const du = Number(i.montant_du ?? 0);
  const paye = Number(i.montant_paye ?? 0);
  const etape = i.etape_traitement ?? "recouvrement";

  if (paye >= du && du > 0) return INFOS.solde;
  if (etape === "resolu") return INFOS.solde;
  if ((JURIDIQUE_ETAPES as readonly string[]).includes(etape)) return INFOS.juridique;
  if (paye > 0 && paye < du) return INFOS.partiel;
  if (i.statut === "relance_envoyee" && paye === 0) return INFOS.relance;
  if (i.statut === "en_retard" && paye === 0) return INFOS.retard;
  return INFOS.a_jour;
}

export function impayeProgress(montant_du: number | string, montant_paye: number | string) {
  const du = Number(montant_du ?? 0);
  const paye = Number(montant_paye ?? 0);
  if (du <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((paye / du) * 100)));
}
