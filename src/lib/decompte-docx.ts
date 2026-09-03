import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";

const GREY = "3A3A3A";
const CONTENT_WIDTH = 9360;

export type DecompteLigne = { libelle: string; detail?: string; montant: number };

export type DecompteData = {
  bienTitre: string;
  bienAdresse?: string | null;
  proprietaire: string;
  moisLabel: string;
  numero?: string;
  loyers: { locataire: string; echeance: string; montant: number }[];
  totalLoyers: number;
  loyersFactures?: number;
  impayes?: { locataire: string; echeance: string; montant: number }[];
  totalImpayes?: number;
  charges: DecompteLigne[];
  totalCharges: number;
  travaux: DecompteLigne[];
  totalTravaux: number;
  honorairesFiscaux: DecompteLigne[];
  totalHonorairesFiscaux: number;
  tauxHonoraires: number;
  honorairesGestion: number;
  net: number;
};

const money = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/\u202f/g, " ")}`;

function txt(
  text: string,
  o: { bold?: boolean; size?: number; italics?: boolean; underline?: boolean; color?: string } = {},
) {
  return new TextRun({
    text,
    bold: o.bold,
    italics: o.italics,
    size: o.size ?? 22,
    color: o.color ?? GREY,
    underline: o.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function p(
  text: string,
  o: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number; italics?: boolean; underline?: boolean; before?: number; after?: number } = {},
) {
  return new Paragraph({
    alignment: o.align,
    spacing: { before: o.before, after: o.after },
    children: [txt(text, { bold: o.bold, size: o.size, italics: o.italics, underline: o.underline })],
  });
}

const thin = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function cell(children: Paragraph[], width: number, opts: { borders?: typeof cellBorders | typeof noBorders } = {}) {
  return new TableCell({
    borders: opts.borders ?? cellBorders,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children,
  });
}

const COL = [5560, 1900, 1900];

function movRow(libelle: string, depense?: number, recette?: number, bold?: boolean) {
  return new TableRow({
    children: [
      cell([p(libelle, { bold })], COL[0]!),
      cell([p(depense === undefined ? "" : money(depense), { bold, align: AlignmentType.RIGHT })], COL[1]!),
      cell([p(recette === undefined ? "" : money(recette), { bold, align: AlignmentType.RIGHT })], COL[2]!),
    ],
  });
}

async function fetchImage(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function generateDecompteDocx(d: DecompteData) {
  const [logo, agrement] = await Promise.all([fetchImage("/gem-logo.png"), fetchImage("/gem-agrement.png")]);
  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const numero = d.numero ?? `${String(today.getMonth() + 1).padStart(3, "0")}/GI/${today.getFullYear()}`;

  const children: (Paragraph | Table)[] = [];

  // En-tête : logo GEM + logo agrément C.DA.IM
  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({
          children: [
            cell(
              logo
                ? [
                    new Paragraph({
                      children: [
                        new ImageRun({
                          type: "png",
                          data: logo,
                          transformation: { width: 149, height: 105 },
                          altText: { title: "GEM Immobilier", description: "Logo GEM Immobilier", name: "Logo" },
                        }),
                      ],
                    }),
                  ]
                : [p("GEM IMMOBILIER", { bold: true, size: 32 })],
              4680,
              { borders: noBorders },
            ),
            cell(
              agrement
                ? [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new ImageRun({
                          type: "png",
                          data: agrement,
                          transformation: { width: 178, height: 106 },
                          altText: { title: "Agent immobilier agréé", description: "C.DA.IM", name: "Agrement" },
                        }),
                      ],
                    }),
                  ]
                : [p("AGENT IMMOBILIER AGRÉÉ", { bold: true, align: AlignmentType.RIGHT })],
              4680,
              { borders: noBorders },
            ),
          ],
        }),
      ],
    }),
  );

  children.push(
    p(`Abidjan, le ${dateStr}`, { align: AlignmentType.RIGHT, before: 320, after: 240 }),
    p(d.proprietaire.toUpperCase(), { bold: true }),
    p("Propriétaire Immobilier"),
    p("Abidjan", { bold: true, underline: true, after: 240 }),
  );

  // Titre encadré
  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [
        new TableRow({
          children: [
            cell(
              [p(`DÉCOMPTE DE REVERSEMENT AU PROPRIÉTAIRE N°${numero}`, { bold: true, align: AlignmentType.CENTER, size: 24 })],
              CONTENT_WIDTH,
            ),
          ],
        }),
      ],
    }),
  );

  children.push(
    p(`${d.bienTitre}${d.bienAdresse ? `, ${d.bienAdresse}` : ""}`.toUpperCase(), {
      bold: true,
      underline: true,
      before: 280,
      after: 160,
    }),
  );

  children.push(
    p(`• Montant facturation des loyers du mois de ${d.moisLabel} : ${money(d.totalLoyers)}`, { after: 60 }),
    p(`• Montant des loyers encaissés : ${money(d.totalLoyers)}`, { after: 240 }),
  );

  // Tableau Dépenses / Recettes
  const rows: TableRow[] = [
    new TableRow({
      children: [
        cell([p("")], COL[0]!),
        cell([p("DÉPENSES", { bold: true, align: AlignmentType.CENTER })], COL[1]!),
        cell([p("RECETTES", { bold: true, align: AlignmentType.CENTER })], COL[2]!),
      ],
    }),
  ];

  if (d.loyers.length) {
    d.loyers.forEach((l) => rows.push(movRow(`Loyer encaissé — ${l.locataire} (${l.echeance})`, undefined, l.montant)));
  } else {
    rows.push(movRow("Aucun loyer encaissé sur la période", undefined, 0));
  }
  rows.push(movRow("TOTAL encaissement de la période", undefined, d.totalLoyers, true));

  rows.push(movRow("A DÉDUIRE", undefined, undefined, true));
  rows.push(movRow(`Honoraires de gérance (${d.tauxHonoraires} %)`, d.honorairesGestion));
  d.charges.forEach((c) => rows.push(movRow(c.detail ? `${c.libelle} (${c.detail})` : c.libelle, c.montant)));
  d.travaux.forEach((t) => rows.push(movRow(t.libelle, t.montant)));
  d.honorairesFiscaux.forEach((h) => rows.push(movRow(h.libelle, h.montant)));

  const totalDeduire = d.honorairesGestion + d.totalCharges + d.totalTravaux + d.totalHonorairesFiscaux;
  rows.push(movRow("TOTAL À DÉDUIRE", totalDeduire, undefined, true));
  rows.push(movRow("Par virement bancaire sur le compte du propriétaire", d.net));
  rows.push(movRow("TOTAL", totalDeduire + d.net, d.totalLoyers, true));


  children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: COL, rows }));

  children.push(
    p("GEM IMMOBILIER", { bold: true, before: 480 }),
    p("La Direction", { italics: true, after: 480 }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 } },
      spacing: { before: 240 },
      children: [
        txt(
          "SARL au capital de 3 000 000 FCFA — 27 BP 759 Abidjan 27 — Tél/Fax : 27 22 51 07 98 — Siège social : Abidjan Cocody II Plateaux Aghien (Las Palmas)",
          { size: 16, color: "777777" },
        ),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        txt("Cité SICOGI Bat C 3ème Étage Porte N°35 — RC N° CI-ABJ-03-2014-B13-04343 — NCC : 1412349 D — Compte Bancaire NSIA BANQUE N° 020616902001-58", {
          size: 16,
          color: "777777",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [txt("E-mail : gemimmobilier14@gmail.com — www.gem-immobilier.org", { size: 16, color: "777777" })],
    }),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22, color: GREY } } } },
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safe = `${d.bienTitre}-${d.moisLabel}`.replace(/[^a-zA-Z0-9]+/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Decompte_${safe}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
