import * as XLSX from "xlsx";
import { computeEcheanceStatut, ETAPE_LABELS, fmtPeriode } from "@/lib/echeance-statut";

export type EcheanceExportRow = {
  periode: string;
  date_echeance: string;
  montant_du: number | string;
  montant_affecte: number | string;
  statut: string;
  etape_traitement: string | null;
  service_en_charge: string | null;
  date_derniere_relance: string | null;
  bien: string;
  locataire: string;
  gestionnaire: string;
};

export function exportEcheancesXlsx(rows: EcheanceExportRow[]) {
  const data = rows.map((e) => {
    const du = Number(e.montant_du ?? 0);
    const paye = Number(e.montant_affecte ?? 0);
    const st = computeEcheanceStatut(e as never);
    return {
      "Période": fmtPeriode(e.periode),
      "Bien": e.bien,
      "Locataire": e.locataire,
      "Gestionnaire": e.gestionnaire,
      "Date limite": e.date_echeance ?? "",
      "Montant dû (FCFA)": du,
      "Montant payé (FCFA)": paye,
      "Reste à payer (FCFA)": Math.max(0, du - paye),
      "Statut": st.label,
      "Étape": ETAPE_LABELS[e.etape_traitement ?? "recouvrement"] ?? e.etape_traitement ?? "",
      "Service en charge": e.service_en_charge ?? "",
      "Dernière relance": e.date_derniere_relance ?? "",
    };
  });

  const totalDu = data.reduce((s, r) => s + Number(r["Montant dû (FCFA)"]), 0);
  const totalPaye = data.reduce((s, r) => s + Number(r["Montant payé (FCFA)"]), 0);
  const totalReste = data.reduce((s, r) => s + Number(r["Reste à payer (FCFA)"]), 0);
  data.push({
    "Période": "TOTAL",
    "Bien": "",
    "Locataire": "",
    "Gestionnaire": "",
    "Date limite": "",
    "Montant dû (FCFA)": totalDu,
    "Montant payé (FCFA)": totalPaye,
    "Reste à payer (FCFA)": totalReste,
    "Statut": "",
    "Étape": "",
    "Service en charge": "",
    "Dernière relance": "",
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 14 }, { wch: 34 }, { wch: 26 }, { wch: 16 }, { wch: 12 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
    { wch: 18 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Impayés");
  const d = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Situation_impayes_${d}.xlsx`);
}
