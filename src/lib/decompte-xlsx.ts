import * as XLSX from "xlsx";
import type { DecompteData } from "@/lib/decompte-docx";

type Row = { Rubrique: string; Détail: string; Dépenses: number | string; Recettes: number | string };

export function exportDecompteXlsx(d: DecompteData) {
  const rows: Row[] = [];
  const add = (r: string, det = "", dep: number | string = "", rec: number | string = "") =>
    rows.push({ Rubrique: r, "Détail": det, "Dépenses": dep, "Recettes": rec });

  add(`Décompte de reversement — ${d.bienTitre}${d.bienAdresse ? `, ${d.bienAdresse}` : ""}`);
  add(`Propriétaire : ${d.proprietaire}`);
  add(`Période : ${d.moisLabel}`);
  add("");

  add("LOYERS ENCAISSÉS");
  d.loyers.forEach((l) => add(`Loyer — ${l.locataire}`, l.echeance, "", Number(l.montant) || 0));
  add("Montant facturé", "", "", Number(d.loyersFactures ?? d.totalLoyers) || 0);
  add("TOTAL ENCAISSÉ", "", "", Number(d.totalLoyers) || 0);

  const impayes = d.impayes ?? [];
  if (impayes.length) {
    add("");
    add("IMPAYÉS");
    impayes.forEach((i) => add(`Impayé — ${i.locataire}`, i.echeance, "", Number(i.montant) || 0));
    add("TOTAL IMPAYÉS", "", "", Number(d.totalImpayes ?? 0) || 0);
  }

  add("");
  add("À DÉDUIRE");
  add(`Honoraires de gérance (${d.tauxHonoraires} %)`, "", Number(d.honorairesGestion) || 0);
  d.charges.forEach((c) => add(c.libelle, c.detail ?? "", Number(c.montant) || 0));
  d.travaux.forEach((t) => add(t.libelle, t.detail ?? "Travaux", Number(t.montant) || 0));
  d.honorairesFiscaux.forEach((h) => add(h.libelle, h.detail ?? "Fiscalité", Number(h.montant) || 0));

  const totalDeduire =
    (Number(d.honorairesGestion) || 0) + (Number(d.totalCharges) || 0) +
    (Number(d.totalTravaux) || 0) + (Number(d.totalHonorairesFiscaux) || 0);
  add("TOTAL À DÉDUIRE", "", totalDeduire);
  add("");
  add("NET À REVERSER AU PROPRIÉTAIRE", "", "", Number(d.net) || 0);

  const ws = XLSX.utils.json_to_sheet(rows, { header: ["Rubrique", "Détail", "Dépenses", "Recettes"] });
  ws["!cols"] = [{ wch: 52 }, { wch: 24 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Décompte");
  const safe = `${d.bienTitre}-${d.moisLabel}`.replace(/[^a-zA-Z0-9]+/g, "_");
  XLSX.writeFile(wb, `Decompte_${safe}.xlsx`);
}
