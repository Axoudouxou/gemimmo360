export type EcheanceStatutKey = "solde" | "juridique" | "partiel" | "impaye";

export const ETAPES_JURIDIQUE = ["mise_en_demeure", "contentieux", "transfere_juridique"] as const;

export type EcheanceStatutInfo = {
  key: EcheanceStatutKey;
  label: string;
  emoji: string;
  className: string;
};

const INFOS: Record<EcheanceStatutKey, EcheanceStatutInfo> = {
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
    label: "Partiel",
    emoji: "🟡",
    className: "bg-yellow-500 hover:bg-yellow-500 text-black",
  },
  impaye: {
    key: "impaye",
    label: "Impayé",
    emoji: "🔴",
    className: "bg-destructive hover:bg-destructive text-destructive-foreground",
  },
};

export function computeEcheanceStatut(e: {
  statut: string;
  etape_traitement?: string | null;
  montant_du: number | string;
  montant_affecte: number | string;
}): EcheanceStatutInfo {
  const du = Number(e.montant_du ?? 0);
  const aff = Number(e.montant_affecte ?? 0);
  const etape = e.etape_traitement ?? "recouvrement";

  if (e.statut === "solde" || (du > 0 && aff >= du) || etape === "resolu") return INFOS.solde;
  if ((ETAPES_JURIDIQUE as readonly string[]).includes(etape)) return INFOS.juridique;
  if (aff > 0) return INFOS.partiel;
  return INFOS.impaye;
}

export function echeanceProgress(montant_du: number | string, montant_affecte: number | string) {
  const du = Number(montant_du ?? 0);
  const aff = Number(montant_affecte ?? 0);
  if (du <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((aff / du) * 100)));
}

export const ETAPE_LABELS: Record<string, string> = {
  recouvrement: "Recouvrement",
  mise_en_demeure: "Mise en demeure",
  contentieux: "Contentieux",
  transfere_juridique: "Transféré au juridique",
  resolu: "Résolu",
};

export const MOYENS_PAIEMENT = [
  { value: "especes", label: "Espèces" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "autre", label: "Autre" },
] as const;

export const fmtMoney = (n: number | string | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "—";

export const fmtPeriode = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : "—";
