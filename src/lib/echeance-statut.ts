export type EcheanceStatutKey = "solde" | "juridique" | "partiel" | "impaye" | "a_venir";

export const ETAPES_JURIDIQUE = ["mise_en_demeure", "contentieux", "transfere_juridique"] as const;

/** Jour limite de paiement du loyer, identique pour tous les contrats. */
export const JOUR_ECHEANCE = 10;

/** Date limite de paiement (le 10) pour une période "YYYY-MM" ou "YYYY-MM-DD". */
export const dateEcheanceForPeriode = (periode: string) =>
  `${String(periode).slice(0, 7)}-${String(JOUR_ECHEANCE).padStart(2, "0")}`;

/** Vrai si la date limite (le 10) est dépassée : le retard commence le 11. */
export function isEnRetard(dateEcheance: string | null | undefined, today = new Date()) {
  if (!dateEcheance) return true;
  const iso = today.toISOString().slice(0, 10);
  return iso > String(dateEcheance).slice(0, 10);
}

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

/** Profils autorisés à créer/modifier impayés, paiements et affectations. */
export const FINANCE_WRITE_ROLES = ["admin", "direction", "recouvrement", "gestion_locative"] as const;

export const canWriteFinance = (role: string | null | undefined) =>
  !!role && (FINANCE_WRITE_ROLES as readonly string[]).includes(role);
