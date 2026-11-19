import type { DecompteData } from "./decompte-docx";

const money = (n: number) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} FCFA`;

/** PDF du décompte validé (archivé pour GEM Finance). N'affecte pas les exports Word/Excel. */
export async function buildDecomptePdf(d: DecompteData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const tri = d.periodicite === "trimestre";
  let y = 18;
  const line = (label: string, value?: string, bold = false) => {
    if (y > 280) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 15, y, { maxWidth: value ? 130 : 180 });
    if (value) doc.text(value, 195, y, { align: "right" });
    y += 6;
  };
  const section = (t: string) => { y += 3; doc.setFontSize(11); line(t, undefined, true); doc.setFontSize(10); };
  doc.setFontSize(13);
  line(`DÉCOMPTE DE REVERSEMENT AU PROPRIÉTAIRE N°${d.numero ?? ""}`, undefined, true);
  doc.setFontSize(10);
  line(`Propriétaire : ${d.proprietaire}`);
  line(`Bien : ${d.bienTitre}${d.bienAdresse ? ` — ${d.bienAdresse}` : ""}`);
  line(`Période : ${d.moisLabel}`);
  section(tri ? "LOYERS DU TRIMESTRE" : "LOYERS DU MOIS");
  d.loyers.forEach((l) => line(`${l.locataire} (${l.echeance})`, money(l.montant)));
  line("Total loyers encaissés", money(d.totalLoyers), true);
  if (d.impayes?.length) {
    section(tri ? "IMPAYÉS DU TRIMESTRE" : "IMPAYÉS DU MOIS");
    d.impayes.forEach((l) => line(`${l.locataire}${l.lot ? ` — ${l.lot}` : ""} (${l.echeance})`, money(l.montant)));
    line("Total impayés", money(d.totalImpayes ?? 0), true);
  }
  section("CHARGES");
  d.charges.forEach((c) => line(c.libelle, money(c.montant)));
  line("Total charges", money(d.totalCharges), true);
  if (d.travaux.length) { section("TRAVAUX"); d.travaux.forEach((c) => line(c.libelle, money(c.montant))); line("Total travaux", money(d.totalTravaux), true); }
  if (d.honorairesFiscaux.length) { section("HONORAIRES FISCAUX"); d.honorairesFiscaux.forEach((c) => line(c.libelle, money(c.montant))); line("Total honoraires fiscaux", money(d.totalHonorairesFiscaux), true); }
  section("SYNTHÈSE");
  line(`Honoraires de gérance (${d.tauxHonoraires} %)`, money(d.honorairesGestion));
  line("NET À REVERSER", money(d.net), true);
  return doc.output("blob");
}
