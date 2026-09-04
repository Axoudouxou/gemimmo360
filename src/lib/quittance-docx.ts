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

export type QuittanceData = {
  numero: string;
  dateEmission: string;
  locataire: string;
  bien: string;
  lot?: string | null;
  periodeLabel: string;
  montant: number;
  modeReglement: string;
  resteAPayer?: number;
};

const money = (n: number) =>
  `${Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/\u202f/g, " ")} FCFA`;

/* ---- Montant en toutes lettres (français) ---- */
const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function belowHundred(n: number): string {
  if (n < 20) return UNITS[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  const base = TENS[t]!;
  if (t === 7 || t === 9) {
    const rest = 10 + u;
    if (t === 7 && u === 1) return "soixante et onze";
    return `${base}-${UNITS[rest]}`;
  }
  if (u === 0) return t === 8 ? "quatre-vingts" : base;
  if (u === 1 && t !== 8) return `${base} et un`;
  return `${base}-${UNITS[u]}`;
}

function belowThousand(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return belowHundred(r);
  const cent = c === 1 ? "cent" : `${UNITS[c]} cent`;
  if (r === 0) return c === 1 ? "cent" : `${cent}s`;
  return `${cent} ${belowHundred(r)}`;
}

export function montantEnLettres(value: number): string {
  const n = Math.round(Math.abs(Number(value) || 0));
  if (n === 0) return "Zéro franc CFA";
  const parts: string[] = [];
  const milliards = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;
  if (milliards) parts.push(`${belowThousand(milliards)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parts.push(`${belowThousand(millions)} million${millions > 1 ? "s" : ""}`);
  if (milliers) parts.push(milliers === 1 ? "mille" : `${belowThousand(milliers)} mille`);
  if (reste) parts.push(belowThousand(reste));
  const text = parts.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} francs CFA`;
}

function txt(text: string, o: { bold?: boolean; size?: number; italics?: boolean; underline?: boolean; color?: string } = {}) {
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

function cell(children: Paragraph[], width: number, borders: typeof cellBorders | typeof noBorders = cellBorders) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children,
  });
}

const LCOL = [3200, 6160];

function infoRow(label: string, value: string, bold = false) {
  return new TableRow({
    children: [
      cell([p(label, { bold: true })], LCOL[0]!),
      cell([p(value, { bold })], LCOL[1]!),
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

export async function generateQuittanceDocx(d: QuittanceData) {
  const [logo, agrement] = await Promise.all([fetchImage("/gem-logo.png"), fetchImage("/gem-agrement.png")]);
  const dateStr = new Date(d.dateEmission).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const children: (Paragraph | Table)[] = [];

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
              noBorders,
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
              noBorders,
            ),
          ],
        }),
      ],
    }),
  );

  children.push(
    p("QUITTANCE DE LOYER", { bold: true, align: AlignmentType.CENTER, size: 32, before: 360, after: 200 }),
    p(`N° ${d.numero}      —      Abidjan, le ${dateStr}`, { align: AlignmentType.CENTER, after: 240 }),
  );

  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [
        new TableRow({
          children: [
            cell([p(`MONTANT : ${money(d.montant)}`, { bold: true, align: AlignmentType.CENTER, size: 28 })], CONTENT_WIDTH),
          ],
        }),
      ],
    }),
  );

  children.push(new Paragraph({ spacing: { after: 240 }, children: [] }));

  children.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: LCOL,
      rows: [
        infoRow("Reçu de M.", d.locataire, true),
        infoRow("La somme de", montantEnLettres(d.montant)),
        infoRow("Pour le loyer du local situé à", d.bien),
        infoRow("Appt / Studio N°", d.lot || "—"),
        infoRow("Période", d.periodeLabel),
        infoRow("Mode de règlement", d.modeReglement),
        infoRow("Reste à payer", money(d.resteAPayer ?? 0)),
      ],
    }),
  );

  children.push(
    p(
      "La présente quittance est délivrée pour valoir ce que de droit et vaut reçu pour solde de tout compte pour la période concernée.",
      { italics: true, before: 320, after: 400 },
    ),
    p("GEM IMMOBILIER", { bold: true }),
    p("La Comptabilité", { italics: true, after: 480 }),
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 6 } },
      spacing: { before: 240 },
      alignment: AlignmentType.CENTER,
      children: [
        txt(
          "SARL au capital de 3 000 000 FCFA — 27 BP 759 Abidjan 27 — Tél/Fax : 27 22 51 07 98 — Siège social : Abidjan Cocody II Plateaux Aghien (Las Palmas)",
          { size: 16, color: "777777" },
        ),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        txt(
          "Cité SICOGI Bat C 3ème Étage Porte N°35 — RC N° CI-ABJ-03-2014-B13-04343 — NCC : 1412349 D — Compte Bancaire NSIA BANQUE N° 020616902001-58",
          { size: 16, color: "777777" },
        ),
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
  const safe = `${d.locataire}-${d.periodeLabel}`.replace(/[^a-zA-Z0-9]+/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Quittance_${safe}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
