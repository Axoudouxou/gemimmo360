import ExcelJS from "exceljs";
import type { DecompteData } from "@/lib/decompte-docx";

const VERT = "FF8AB334";
const GRIS = "FF4A4A4A";
const VERT_CLAIR = "FFE7F0D6";
const MONEY = '#,##0" FCFA"';
const FONT = "Arial";
const LAST_COL = 4;

async function loadImage(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function exportDecompteXlsx(d: DecompteData) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Décompte");
  ws.properties.defaultRowHeight = 16;
  ws.columns = [{ width: 52 }, { width: 30 }, { width: 20 }, { width: 20 }];

  const [logo, agrement] = await Promise.all([loadImage("/gem-logo.png"), loadImage("/gem-agrement.png")]);
  if (logo) {
    const id = wb.addImage({ buffer: logo as never, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 105 } });
  }
  if (agrement) {
    const id = wb.addImage({ buffer: agrement as never, extension: "png" });
    ws.addImage(id, { tl: { col: 3, row: 0 }, ext: { width: 178, height: 106 } });
  }

  let r = 7;
  const bandeau = (text: string, size: number, bg: string, color: string) => {
    ws.mergeCells(r, 1, r, LAST_COL);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, size, bold: true, color: { argb: color } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    if (bg !== "none") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    ws.getRow(r).height = size + 10;
    r++;
  };

  bandeau("DÉCOMPTE DE REVERSEMENT", 14, VERT, "FFFFFFFF");
  bandeau(`${d.bienTitre}${d.bienAdresse ? ` — ${d.bienAdresse}` : ""}`, 11, "none", GRIS);
  bandeau(`Propriétaire : ${d.proprietaire} — Période : ${d.moisLabel}`, 10, "none", GRIS);
  r++;

  const section = (title: string) => {
    ws.mergeCells(r, 1, r, LAST_COL);
    const c = ws.getCell(r, 1);
    c.value = title;
    c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS } };
    c.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(r).height = 20;
    r++;
    const h = ws.getRow(r);
    ["Rubrique", "Détail", "Dépenses", "Recettes"].forEach((t, i) => {
      const cell = h.getCell(i + 1);
      cell.value = t;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: GRIS } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT_CLAIR } };
      cell.alignment = { horizontal: i >= 2 ? "right" : "left" };
    });
    r++;
  };

  const ligne = (lib: string, det = "", dep?: number | string, rec?: number | string) => {
    const row = ws.getRow(r);
    row.values = [lib, det, dep ?? "", rec ?? ""];
    row.eachCell((c, i) => {
      c.font = { name: FONT, size: 10, color: { argb: GRIS } };
      c.alignment = { horizontal: i >= 3 ? "right" : "left", vertical: "top", wrapText: i <= 2 };
      if (i >= 3) c.numFmt = MONEY;
      c.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } } };
    });
    r++;
  };

  const total = (lib: string, dep?: number, rec?: number) => {
    const row = ws.getRow(r);
    row.values = [lib, "", dep ?? "", rec ?? ""];
    for (let i = 1; i <= LAST_COL; i++) {
      const c = row.getCell(i);
      c.font = { name: FONT, size: 11, bold: true, color: { argb: GRIS } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT_CLAIR } };
      c.alignment = { horizontal: i >= 3 ? "right" : "left" };
      if (i >= 3) c.numFmt = MONEY;
    }
    r++;
  };

  const num = (v: unknown) => Number(v) || 0;

  section("LOYERS ENCAISSÉS");
  d.loyers.forEach((l) => ligne(`Loyer — ${l.locataire}`, l.echeance, undefined, num(l.montant)));
  ligne("Montant facturé", "", undefined, num(d.loyersFactures ?? d.totalLoyers));
  total("TOTAL ENCAISSÉ", undefined, num(d.totalLoyers));
  r++;

  const impayes = d.impayes ?? [];
  if (impayes.length) {
    section("IMPAYÉS");
    impayes.forEach((i) => ligne(`Impayé — ${i.locataire}`, i.echeance, undefined, num(i.montant)));
    total("TOTAL IMPAYÉS", undefined, num(d.totalImpayes));
    r++;
  }

  section("À DÉDUIRE");
  ligne(`Honoraires de gérance (${d.tauxHonoraires} %)`, "", num(d.honorairesGestion));
  d.charges.forEach((c) => ligne(c.libelle, c.detail ?? "Charges", num(c.montant)));
  d.travaux.forEach((t) => ligne(t.libelle, t.detail ?? "Travaux", num(t.montant)));
  d.honorairesFiscaux.forEach((h) => ligne(h.libelle, h.detail ?? "Fiscalité", num(h.montant)));
  const totalDeduire =
    num(d.honorairesGestion) + num(d.totalCharges) + num(d.totalTravaux) + num(d.totalHonorairesFiscaux);
  total("TOTAL À DÉDUIRE", totalDeduire);
  r += 2;

  ws.mergeCells(r, 1, r, LAST_COL);
  const net = ws.getCell(r, 1);
  net.value = `NET À REVERSER AU PROPRIÉTAIRE : ${Math.round(num(d.net)).toLocaleString("fr-FR").replace(/\u202f/g, " ")} FCFA`;
  net.font = { name: FONT, size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  net.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT } };
  net.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(r).height = 24;

  const footer = [
    "GEM IMMOBILIER — Le partenaire qui sécurise vos biens",
    "SARL au capital de 3 000 000 FCFA — 27 BP 759 Abidjan 27 — Tél/Fax : 27 22 51 07 98 — Siège social : Abidjan Cocody II Plateaux Aghien (Las Palmas)",
    "Cité SICOGI Bat C 3ème Étage Porte N°35 — RC N° CI-ABJ-03-2014-B13-04343 — NCC : 1412349 D — Compte Bancaire NSIA BANQUE N° 020616902001-58",
    "E-mail : gemimmobilier14@gmail.com — www.gem-immobilier.org",
  ];
  footer.forEach((text, i) => {
    const row = r + 2 + i;
    ws.mergeCells(row, 1, row, LAST_COL);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: FONT, size: 8, bold: i === 0, color: { argb: i === 0 ? VERT : "FF777777" } };
    c.alignment = { horizontal: "center" };
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = `${d.bienTitre}-${d.moisLabel}`.replace(/[^a-zA-Z0-9]+/g, "_");
  a.download = `Decompte_${safe}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
