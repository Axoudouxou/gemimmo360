import { describe, expect, test } from "bun:test";
import { canCreateContract, canGenerateDecompte, isLegalTransactionRole, STATUTS_LOT } from "./operational-rules";
import { paiementEnRetard, calcPenalite, canWriteFinance } from "./echeance-statut";

describe("Bloc 1 — règles opérationnelles", () => {
  test("les lots acceptent exactement les quatre statuts validés", () => {
    expect(STATUTS_LOT.map((s) => s.value)).toEqual(["vacant", "loue", "en_travaux", "vendu"]);
  });
  test("création de contrat réservée aux quatre profils demandés", () => {
    for (const role of ["admin", "direction", "juridique", "gestion_locative"]) expect(canCreateContract(role)).toBe(true);
    for (const role of ["commercial", "technico_commercial", "technique", "recouvrement", "en_attente", null]) expect(canCreateContract(role)).toBe(false);
  });
  test("décompte réservé à Administration, Direction, Gestion locative et Finance", () => {
    for (const role of ["admin", "direction", "gestion_locative", "recouvrement"]) expect(canGenerateDecompte(role)).toBe(true);
    for (const role of ["commercial", "technico_commercial", "technique", "juridique", null]) expect(canGenerateDecompte(role)).toBe(false);
  });
  test("émission de quittance réservée aux quatre profils finance", () => {
    for (const role of ["admin", "direction", "gestion_locative", "recouvrement"]) expect(canWriteFinance(role)).toBe(true);
    for (const role of ["commercial", "technico_commercial", "technique", "juridique"]) expect(canWriteFinance(role)).toBe(false);
  });
  test("juridique utilise la modification restreinte des transactions", () => {
    expect(isLegalTransactionRole("juridique")).toBe(true);
    expect(isLegalTransactionRole("commercial")).toBe(false);
  });
  test("pénalité impossible jusqu’au 10 inclus, applicable seulement dès le 11 de la période", () => {
    expect(paiementEnRetard("2026-10", "2026-10-01")).toBe(false);
    expect(paiementEnRetard("2026-10", "2026-10-10")).toBe(false);
    expect(paiementEnRetard("2026-10", "2026-10-11")).toBe(true);
    expect(paiementEnRetard("2026-11", "2026-10-20")).toBe(false);
    expect(calcPenalite(100000)).toBe(10000);
  });
});