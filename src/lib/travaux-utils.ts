export const TRAVAUX_STATUTS = [
  { value: "a_qualifier", label: "À qualifier" },
  { value: "a_valider", label: "À valider" },
  { value: "valide", label: "Validé" },
  { value: "planifie", label: "Planifié" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
  { value: "refuse", label: "Refusé" },
  { value: "annule", label: "Annulé" },
] as const;

export const STATUT_LABEL: Record<string, string> = Object.fromEntries(
  TRAVAUX_STATUTS.map((s) => [s.value, s.label]),
);

export const STATUT_CLASS: Record<string, string> = {
  a_qualifier: "bg-muted text-muted-foreground hover:bg-muted",
  a_valider: "bg-amber-500 text-white hover:bg-amber-500",
  valide: "bg-sky-500 text-white hover:bg-sky-500",
  planifie: "bg-blue-600 text-white hover:bg-blue-600",
  en_cours: "bg-orange-500 text-white hover:bg-orange-500",
  termine: "bg-green-600 text-white hover:bg-green-600",
  refuse: "bg-red-600 text-white hover:bg-red-600",
  annule: "bg-slate-700 text-white hover:bg-slate-700",
};

export const PRIORITES = [
  { value: "critique", label: "Critique" },
  { value: "haute", label: "Haute" },
  { value: "normale", label: "Normale" },
  { value: "basse", label: "Basse" },
] as const;

export const PRIORITE_LABEL: Record<string, string> = Object.fromEntries(
  PRIORITES.map((p) => [p.value, p.label]),
);

export const PRIORITE_CLASS: Record<string, string> = {
  critique: "bg-red-600 text-white hover:bg-red-600",
  haute: "bg-orange-500 text-white hover:bg-orange-500",
  normale: "bg-amber-400 text-black hover:bg-amber-400",
  basse: "bg-muted text-muted-foreground hover:bg-muted",
};

export const CHARGES = [
  { value: "bailleur", label: "Bailleur" },
  { value: "locataire", label: "Locataire" },
  { value: "gem", label: "Agence" },
  { value: "partage", label: "Partagé" },
  { value: "a_determiner", label: "À déterminer" },
] as const;

export const CHARGE_LABEL: Record<string, string> = Object.fromEntries(
  CHARGES.map((c) => [c.value, c.label]),
);

export const MOTIFS_REFUS = [
  "À la charge du locataire",
  "Demande non justifiée",
  "Devis refusé",
  "Hors périmètre",
  "Non pris en charge par le bailleur",
  "Autre",
];

export const STATUTS_CLOS = ["termine", "refuse", "annule"];

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Nombre de jours entre aujourd'hui et une date ISO (négatif = passé). */
export function daysUntil(iso: string): number {
  const d = new Date(iso + "T00:00:00");
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export type EcheanceInfo = { label: string; late: boolean; today: boolean };

export function echeanceInfo(iso: string | null | undefined): EcheanceInfo | null {
  if (!iso) return null;
  const diff = daysUntil(iso);
  if (diff === 0) return { label: "Aujourd'hui", late: false, today: true };
  if (diff < 0) {
    const n = Math.abs(diff);
    return { label: `En retard de ${n} jour${n > 1 ? "s" : ""}`, late: true, today: false };
  }
  if (diff === 1) return { label: "Demain", late: false, today: false };
  return { label: fmtDate(iso), late: false, today: false };
}

/** Date de référence pour l'échéance : date_echeance sinon intervention prévue. */
export function echeanceDate(t: { date_echeance?: string | null; date_intervention_prevue?: string | null }) {
  return t.date_echeance ?? t.date_intervention_prevue ?? null;
}

export function isLate(t: { statut: string; date_echeance?: string | null; date_intervention_prevue?: string | null }) {
  if (STATUTS_CLOS.includes(t.statut)) return false;
  const d = echeanceDate(t);
  return !!d && daysUntil(d) < 0;
}

export function needsAction(t: {
  statut: string;
  priorite?: string | null;
  assigne_a?: string | null;
  date_echeance?: string | null;
  date_intervention_prevue?: string | null;
}) {
  if (STATUTS_CLOS.includes(t.statut)) return false;
  if (t.statut === "a_qualifier" || t.statut === "a_valider") return true;
  if (isLate(t)) return true;
  if (t.priorite === "critique" || t.priorite === "haute") return true;
  if (!t.assigne_a) return true;
  return false;
}

const STATUT_ORDER: Record<string, number> = {
  a_qualifier: 2,
  a_valider: 3,
  en_cours: 4,
  planifie: 5,
  valide: 6,
  refuse: 7,
  termine: 8,
  annule: 9,
};

/** Poids de tri : plus petit = plus urgent. */
export function sortWeight(t: {
  statut: string;
  priorite?: string | null;
  date_echeance?: string | null;
  date_intervention_prevue?: string | null;
}) {
  const late = isLate(t);
  if (late && (t.priorite === "critique" || t.priorite === "haute")) return 0;
  if (late) return 1;
  return STATUT_ORDER[t.statut] ?? 6;
}

/** "rosch.kouassi@x.org" -> "Rosch Kouassi" */
export function displayName(email: string | null | undefined) {
  if (!email) return "Non assigné";
  const local = email.split("@")[0];
  if (!local) return email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
