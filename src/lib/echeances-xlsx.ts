import ExcelJS from "exceljs";
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

const VERT = "FF8AB334";
const GRIS = "FF4A4A4A";
const VERT_CLAIR = "FFE7F0D6";
const MONEY = '#,##0" FCFA"';
const FONT = "Arial";

async function loadImage(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function exportEcheancesXlsx(rows: EcheanceExportRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Impayés");
  ws.properties.defaultRowHeight = 16;

  const [logo, agrement] = await Promise.all([loadImage("/gem-logo.png"), loadImage("/gem-agrement.png")]);
  if (logo) {
    const id = wb.addImage({ buffer: logo as never, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 105 } });
  }
  if (agrement) {
    const id = wb.addImage({ buffer: agrement as never, extension: "png" });
    ws.addImage(id, { tl: { col: 9, row: 0 }, ext: { width: 178, height: 106 } });
  }

  const headers = [
    "Période",
    "Bien",
    "Locataire",
    "Gestionnaire",
    "Date limite",
    "Montant dû",
    "Montant payé",
    "Reste à payer",
    "Statut",
    "Étape",
    "Service en charge",
    "Dernière relance",
  ];
  const widths = [14, 34, 28, 18, 13, 16, 16, 16, 20, 20, 18, 16];
  ws.columns = widths.map((w) => ({ width: w }));

  const lastCol = headers.length;
  const colLetter = (n: number) => ws.getColumn(n).letter;

  const bandeau = (row: number, text: string, size: number, bg: string, color: string) => {
    ws.mergeCells(row, 1, row, lastCol);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: FONT, size, bold: true, color: { argb: color } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    if (bg !== "none") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    ws.getRow(row).height = size + 10;
  };

  bandeau(7, "SITUATION DES IMPAYÉS", 14, VERT, "FFFFFFFF");
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  bandeau(8, `Édité le ${today} — ${rows.length} échéance(s)`, 10, "none", GRIS);

  const headerRow = ws.getRow(10);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    c.alignment = { horizontal: i >= 5 && i <= 7 ? "center" : "left", vertical: "middle", wrapText: true };
  });
  headerRow.height = 22;

  let r = 11;
  rows.forEach((e) => {
    const du = Number(e.montant_du ?? 0);
    const paye = Number(e.montant_affecte ?? 0);
    const st = computeEcheanceStatut(e as never);
    const row = ws.getRow(r);
    row.values = [
      fmtPeriode(e.periode),
      e.bien,
      e.locataire,
      e.gestionnaire,
      e.date_echeance ?? "",
      du,
      paye,
      Math.max(0, du - paye),
      st.label,
      ETAPE_LABELS[e.etape_traitement ?? "recouvrement"] ?? e.etape_traitement ?? "",
      e.service_en_charge ?? "",
      e.date_derniere_relance ?? "",
    ];
    row.eachCell((c, i) => {
      c.font = { name: FONT, size: 10, color: { argb: GRIS } };
      c.alignment = { horizontal: i >= 6 && i <= 8 ? "right" : "left", vertical: "top", wrapText: i === 2 || i === 3 };
      if (i >= 6 && i <= 8) c.numFmt = MONEY;
      c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
    r++;
  });

  const first = 11;
  const last = r - 1;
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = "TOTAL";
  if (last >= first) {
    totalRow.getCell(6).value = { formula: `SUM(${colLetter(6)}${first}:${colLetter(6)}${last})` };
    totalRow.getCell(7).value = { formula: `SUM(${colLetter(7)}${first}:${colLetter(7)}${last})` };
    totalRow.getCell(8).value = { formula: `SUM(${colLetter(8)}${first}:${colLetter(8)}${last})` };
  } else {
    totalRow.getCell(6).value = 0;
    totalRow.getCell(7).value = 0;
    totalRow.getCell(8).value = 0;
  }
  for (let i = 1; i <= lastCol; i++) {
    const c = totalRow.getCell(i);
    c.font = { name: FONT, size: 11, bold: true, color: { argb: GRIS } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT_CLAIR } };
    c.alignment = { horizontal: i >= 6 && i <= 8 ? "right" : "left" };
    if (i >= 6 && i <= 8) c.numFmt = MONEY;
  }

  const resteRow = r + 2;
  ws.mergeCells(resteRow, 1, resteRow, lastCol);
  const rc = ws.getCell(resteRow, 1);
  rc.value = {
    formula: `"TOTAL RESTE À RECOUVRER : "&TEXT(${colLetter(8)}${r},"#,##0")&" FCFA"`,
  };
  rc.font = { name: FONT, size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  rc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT } };
  rc.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(resteRow).height = 24;

  const footer = [
    "GEM IMMOBILIER — Le partenaire qui sécurise vos biens",
    "SARL au capital de 3 000 000 FCFA — 27 BP 759 Abidjan 27 — Tél/Fax : 27 22 51 07 98 — Siège social : Abidjan Cocody II Plateaux Aghien (Las Palmas)",
    "Cité SICOGI Bat C 3ème Étage Porte N°35 — RC N° CI-ABJ-03-2014-B13-04343 — NCC : 1412349 D — Compte Bancaire NSIA BANQUE N° 020616902001-58",
    "E-mail : gemimmobilier14@gmail.com — www.gem-immobilier.org",
  ];
  footer.forEach((text, i) => {
    const row = resteRow + 2 + i;
    ws.mergeCells(row, 1, row, lastCol);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: FONT, size: 8, bold: i === 0, color: { argb: i === 0 ? VERT : "FF777777" } };
    c.alignment = { horizontal: "center" };
  });

  ws.views = [{ state: "frozen", ySplit: 10 }];
  ws.autoFilter = { from: { row: 10, column: 1 }, to: { row: Math.max(10, last), column: lastCol } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Situation_impayes_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
