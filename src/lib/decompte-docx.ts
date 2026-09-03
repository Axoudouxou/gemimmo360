import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const GEM_GREEN = "8AB334";
const GEM_GREEN_DARK = "5E7A22";
const GEM_GREY = "4A4A4A";
const GEM_LIGHT = "EEF6DC";

const CONTENT_WIDTH = 9360;

export type DecompteLigne = { libelle: string; detail?: string; montant: number };

export type DecompteData = {
  bienTitre: string;
  bienAdresse?: string | null;
  proprietaire: string;
  moisLabel: string;
  loyers: { locataire: string; echeance: string; montant: number }[];
  totalLoyers: number;
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

const money = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} FCFA`;

function txt(text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return new TextRun({ text, bold: opts.bold, color: opts.color ?? GEM_GREY, size: opts.size ?? 20, italics: opts.italics });
}

const border = { style: BorderStyle.SINGLE, size: 1, color: "DDE3D5" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(children: Paragraph[], opts: { width: number; fill?: string } = { width: 3120 }) {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children,
  });
}

function p(text: string, opts: { bold?: boolean; right?: boolean; color?: string; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [txt(text, { bold: opts.bold, color: opts.color, italics: opts.italics })],
  });
}

function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [txt(text, { bold: true, color: GEM_GREEN_DARK, size: 24 })],
  });
}

function twoColTable(rows: { l: string; r: number; bold?: boolean; fill?: string }[]) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [6360, 3000],
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            cell([p(r.l, { bold: r.bold })], { width: 6360, fill: r.fill }),
            cell([p(money(r.r), { bold: r.bold, right: true })], { width: 3000, fill: r.fill }),
          ],
        }),
    ),
  });
}

function headerRow(labels: string[], widths: number[]) {
  return new TableRow({
    children: labels.map((l, i) =>
      cell([p(l.toUpperCase(), { bold: true, color: GEM_GREEN_DARK, right: i === labels.length - 1 })], {
        width: widths[i]!,
        fill: GEM_LIGHT,
      }),
    ),
  });
}

async function fetchLogo(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/apple-touch-icon.png");
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function generateDecompteDocx(d: DecompteData) {
  const logo = await fetchLogo();
  const children: (Paragraph | Table)[] = [];

  if (logo) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: logo,
            transformation: { width: 64, height: 64 },
            altText: { title: "GEM Immobilier", description: "Logo GEM Immobilier", name: "Logo" },
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({ children: [txt("GEM IMMOBILIER", { bold: true, color: GEM_GREEN, size: 32 })] }),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GEM_GREEN, space: 4 } },
      children: [txt("Administration de biens — Abidjan, Côte d’Ivoire", { italics: true, color: "808080" })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 80 },
      children: [txt("DÉCOMPTE PROPRIÉTAIRE", { bold: true, size: 30, color: GEM_GREY })],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [txt(`Période : ${d.moisLabel}`, { bold: true })] }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        headerRow(["Bien", "Propriétaire"], [4680, 4680]),
        new TableRow({
          children: [
            cell([p(d.bienTitre, { bold: true }), ...(d.bienAdresse ? [p(d.bienAdresse)] : [])], { width: 4680 }),
            cell([p(d.proprietaire, { bold: true })], { width: 4680 }),
          ],
        }),
      ],
    }),
  );

  // 1. Loyers
  children.push(sectionTitle("1. Loyers encaissés"));
  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [4680, 2000, 2680],
      rows: [
        headerRow(["Locataire", "Échéance", "Montant"], [4680, 2000, 2680]),
        ...(d.loyers.length
          ? d.loyers.map(
              (l) =>
                new TableRow({
                  children: [
                    cell([p(l.locataire)], { width: 4680 }),
                    cell([p(l.echeance)], { width: 2000 }),
                    cell([p(money(l.montant), { right: true })], { width: 2680 }),
                  ],
                }),
            )
          : [
              new TableRow({
                children: [
                  cell([p("Aucun loyer encaissé sur la période")], { width: 4680 }),
                  cell([p("—")], { width: 2000 }),
                  cell([p(money(0), { right: true })], { width: 2680 }),
                ],
              }),
            ]),
        new TableRow({
          children: [
            cell([p("Total loyers encaissés", { bold: true })], { width: 4680, fill: GEM_LIGHT }),
            cell([p("")], { width: 2000, fill: GEM_LIGHT }),
            cell([p(money(d.totalLoyers), { bold: true, right: true })], { width: 2680, fill: GEM_LIGHT }),
          ],
        }),
      ],
    }),
  );

  // 2. Charges
  children.push(sectionTitle("2. Charges déduites"));
  children.push(
    twoColTable([
      ...(d.charges.length
        ? d.charges.map((c) => ({ l: c.detail ? `${c.libelle} (${c.detail})` : c.libelle, r: c.montant }))
        : [{ l: "Aucune charge sur la période", r: 0 }]),
      { l: "Total charges", r: d.totalCharges, bold: true, fill: GEM_LIGHT },
    ]),
  );

  // 3. Travaux
  children.push(sectionTitle("3. Dépenses réelles de travaux"));
  children.push(
    twoColTable([
      ...(d.travaux.length
        ? d.travaux.map((t) => ({ l: t.libelle, r: t.montant }))
        : [{ l: "Aucun travaux réglé sur la période", r: 0 }]),
      { l: "Total travaux", r: d.totalTravaux, bold: true, fill: GEM_LIGHT },
    ]),
  );

  // 4. Honoraires fiscalité
  children.push(sectionTitle("4. Honoraires de fiscalité"));
  children.push(
    twoColTable([
      ...(d.honorairesFiscaux.length
        ? d.honorairesFiscaux.map((h) => ({ l: h.libelle, r: h.montant }))
        : [{ l: "Aucun honoraire fiscal sur la période", r: 0 }]),
      { l: "Total honoraires de fiscalité", r: d.totalHonorairesFiscaux, bold: true, fill: GEM_LIGHT },
    ]),
  );

  // 5. Honoraires de gestion
  children.push(sectionTitle("5. Honoraires de gestion"));
  children.push(
    twoColTable([
      { l: `Honoraires d’agence (${d.tauxHonoraires} % du loyer encaissé)`, r: d.honorairesGestion },
    ]),
  );

  // Net
  children.push(
    new Paragraph({ spacing: { before: 320 } }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [6360, 3000],
      rows: [
        new TableRow({
          children: [
            cell([new Paragraph({ children: [txt("MONTANT NET REVERSÉ AU PROPRIÉTAIRE", { bold: true, color: "FFFFFF", size: 24 })] })], {
              width: 6360,
              fill: GEM_GREEN,
            }),
            cell(
              [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt(money(d.net), { bold: true, color: "FFFFFF", size: 24 })] })],
              { width: 3000, fill: GEM_GREEN },
            ),
          ],
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 160 },
      children: [
        txt(
          `Détail : ${money(d.totalLoyers)} (loyers) − ${money(d.totalCharges)} (charges) − ${money(d.totalTravaux)} (travaux) − ${money(d.totalHonorairesFiscaux)} (honoraires fiscalité) − ${money(d.honorairesGestion)} (honoraires de gestion) = ${money(d.net)}`,
          { italics: true, color: "808080" },
        ),
      ],
    }),
    new Paragraph({
      spacing: { before: 320 },
      children: [
        txt("Document généré automatiquement par Immo360 — GEM Immobilier. Pour toute question, contactez votre gestionnaire.", {
          italics: true,
          color: "808080",
          size: 18,
        }),
      ],
    }),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: "Inter", size: 20, color: GEM_GREY } } } },
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
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
