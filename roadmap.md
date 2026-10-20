# Roadmap — Refonte financière (échéances / paiements / affectations)

## Corrections de l’audit — production GEM
- [x] Sauvegarde complète téléchargée — téléchargement confirmé par Axelle le 20 octobre 2026 ; reprise autorisée.
- [ ] Bloc 1 — Corrections appliquées ; règles et pages contrôlées. Validation complète des transactions bloquée : le compte de test SQL ne peut pas exécuter les opérations authentifiées. Aucun passage au bloc 2.
- [ ] Bloc 2 — Transactions et fin de bail (attend le feu vert après le bloc 1).
- [ ] Bloc 3 — Transfert et suivi juridique (attend la validation du bloc précédent).
- [ ] Bloc 4 — Travaux et états des lieux (attend la validation du bloc précédent).
- [ ] Bloc 5 — Fiscalité et calendrier (attend la validation du bloc précédent).
- [ ] Bloc 6 — Charges et décomptes (attend la validation du bloc précédent).
- [ ] Rapport final après validation des six blocs.

- [x] Étape 0 — Sauvegarde CSV des tables impayes* et contrats
- [x] Étape 1 — Création du schéma (echeances, paiements, affectations, affectations_historique) + RLS + triggers
- [x] Étape 2 — Reconstitution + rapport comparatif : 0 écart (12 041 000 F de dette, identique à l'ancien modèle)
- [x] Étape 3 — Bascule des écrans : « Impayés » = liste d'échéances (/echeances), Situation locative + grand livre sur fiche contrat et fiche locataire, saisie de paiement avec aperçu FIFO, ancien écran conservé en lecture seule (/impayes, « Impayés (archive) »)
- [x] Correction workflow : aucune génération automatique mensuelle (aucune tâche planifiée n'existe), saisie manuelle des impayés (période obligatoire), affectation manuelle obligatoire (FIFO retiré), réaffectation admin tracée
- [x] Purge des échéances reconstituées non documentées : il reste 41 échéances issues de l'ancien module (dette 12 041 000 F inchangée)
- [ ] Étape 4 — Retrait de l'ancien modèle (après observation)


Décisions validées : historique complet depuis le début de chaque contrat ; dépôt de garantie hors échéances ; charges récurrentes inchangées.
