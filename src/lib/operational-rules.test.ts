import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { canCreateContract, canGenerateDecompte, isLegalTransactionRole, STATUTS_LOT } from "./operational-rules";
import { paiementEnRetard, calcPenalite, canWriteFinance } from "./echeance-statut";
import { levelFor } from "./permissions-matrix";

describe("Bloc 1 — règles opérationnelles", () => {
  test("les lots acceptent exactement les quatre statuts validés", () => {
    assert.deepEqual(STATUTS_LOT.map((s) => s.value), ["vacant", "loue", "en_travaux", "vendu"]);
  });
  test("création de contrat réservée aux quatre profils demandés", () => {
    for (const role of ["admin", "direction", "juridique", "gestion_locative"]) assert.equal(canCreateContract(role), true);
    for (const role of ["commercial", "technico_commercial", "technique", "recouvrement", "en_attente", null]) assert.equal(canCreateContract(role), false);
  });
  test("décompte réservé à Administration, Direction, Gestion locative et Finance", () => {
    for (const role of ["admin", "direction", "gestion_locative", "recouvrement"]) assert.equal(canGenerateDecompte(role), true);
    for (const role of ["commercial", "technico_commercial", "technique", "juridique", null]) assert.equal(canGenerateDecompte(role), false);
  });
  test("émission de quittance réservée aux quatre profils finance", () => {
    for (const role of ["admin", "direction", "gestion_locative", "recouvrement"]) assert.equal(canWriteFinance(role), true);
    for (const role of ["commercial", "technico_commercial", "technique", "juridique"]) assert.equal(canWriteFinance(role), false);
  });
  test("juridique utilise la modification restreinte des transactions", () => {
    assert.equal(isLegalTransactionRole("juridique"), true);
    assert.equal(isLegalTransactionRole("commercial"), false);
  });
  test("la matrice refuse la génération de décompte aux profils non autorisés", () => {
    for (const role of ["commercial", "technico_commercial", "technique", "juridique"]) {
      assert.equal(levelFor({}, "locatif.decompte_generate", role), "none");
    }
    assert.equal(levelFor({}, "locatif.decompte_generate", "recouvrement"), "full");
  });
  test("juridique consulte les transactions et modifie seulement statut et notes", () => {
    assert.equal(levelFor({}, "locatif.transaction_read", "juridique"), "read");
    assert.equal(levelFor({}, "locatif.transaction_legal", "juridique"), "full");
    assert.equal(levelFor({}, "locatif.transactions", "juridique"), "none");
    assert.equal(levelFor({}, "locatif.transaction_delete", "juridique"), "none");
  });
  test("pénalité impossible jusqu’au 10 inclus, applicable seulement dès le 11 de la période", () => {
    assert.equal(paiementEnRetard("2026-10", "2026-10-01"), false);
    assert.equal(paiementEnRetard("2026-10", "2026-10-10"), false);
    assert.equal(paiementEnRetard("2026-10", "2026-10-11"), true);
    assert.equal(paiementEnRetard("2026-11", "2026-10-20"), false);
    assert.equal(calcPenalite(100000), 10000);
  });
});