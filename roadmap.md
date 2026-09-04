# Roadmap — Refonte financière (échéances / paiements / affectations)

- [x] Étape 0 — Sauvegarde CSV des tables impayes* et contrats
- [x] Étape 1 — Création du schéma (echeances, paiements, affectations, affectations_historique) + RLS + triggers
- [x] Étape 2 — Reconstitution + rapport comparatif : 0 écart (12 041 000 F de dette, identique à l'ancien modèle)
- [x] Étape 3 — Bascule des écrans : « Impayés » = liste d'échéances (/echeances), Situation locative + grand livre sur fiche contrat et fiche locataire, saisie de paiement avec aperçu FIFO, ancien écran conservé en lecture seule (/impayes, « Impayés (archive) »)
- [x] Correction workflow : aucune génération automatique mensuelle (aucune tâche planifiée n'existe), saisie manuelle des impayés (période obligatoire), affectation manuelle obligatoire (FIFO retiré), réaffectation admin tracée
- [x] Purge des échéances reconstituées non documentées : il reste 41 échéances issues de l'ancien module (dette 12 041 000 F inchangée)
- [ ] Étape 4 — Retrait de l'ancien modèle (après observation)


Décisions validées : historique complet depuis le début de chaque contrat ; dépôt de garantie hors échéances ; charges récurrentes inchangées.
