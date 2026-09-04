# Refonte financière : échéances individuelles + paiements affectés

Objectif : passer d'un modèle « un impayé = un solde global par contrat » à un modèle comptable
« échéances mensuelles + paiements + affectations », sans qu'aucune dette n'apparaisse ou ne disparaisse.

## État actuel constaté

- 281 contrats (272 actifs), date de début la plus ancienne : novembre 2016
- 42 lignes `impayes` seulement : 26 en retard (10 838 000 F dus, 0 payé), 5 en relance (3 378 000 dus / 2 175 000 payés), 11 à jour (3 270 000 / 3 270 000)
- Aucune table `paiements` n'existe aujourd'hui : les paiements sont un simple champ `montant_paye` cumulé sur `impayes`
- Reconstitution rétroactive complète (début de contrat → mois courant) = environ 4 544 échéances

## Schéma proposé

### `echeances`
| champ | type | rôle |
|---|---|---|
| contrat_id | uuid → contrats | contrat concerné |
| periode | date (1er du mois) | mois/année de la période |
| date_echeance | date | date limite de paiement |
| montant_du | numeric | loyer dû pour la période |
| montant_affecte | numeric (calculé) | somme des affectations reçues |
| statut | text calculé | `impaye` / `partiel` / `solde` |
| etape_traitement | text | `recouvrement` / `mise_en_demeure` / `contentieux` / `transfere_juridique` / `resolu` |
| service_en_charge | text | recouvrement ou juridique |
| notes, date_derniere_relance, dates procédure | reprises de `impayes` |

Unicité : un seul enregistrement par (contrat, période).
`montant_affecte` et `statut` sont maintenus par trigger à chaque changement d'affectation — jamais saisis à la main.

### `paiements`
| champ | type |
|---|---|
| contrat_id | uuid → contrats |
| date_paiement | date (date réelle d'encaissement) |
| montant | numeric |
| moyen_paiement | text (espèces, virement, chèque, mobile money, autre) |
| reference | text (n° de chèque / transaction) |
| notes, created_by | traçabilité |

Un paiement est indépendant de la période : c'est l'affectation qui fait le lien.

### `affectations`
| champ | type |
|---|---|
| paiement_id | uuid → paiements |
| echeance_id | uuid → echeances |
| montant | numeric > 0 |
| mode | `auto_fifo` ou `manuel` |
| created_by / created_at | traçabilité |

Contrôles : la somme des affectations d'un paiement ne peut dépasser son montant ; la somme des
affectations d'une échéance ne peut dépasser le montant dû.

### `affectations_historique`
Toute création, modification ou suppression d'affectation est journalisée : auteur, date, ancienne
valeur, nouvelle valeur, échéance concernée. Seuls les administrateurs peuvent réaffecter manuellement.

### Règle FIFO
À l'enregistrement d'un paiement, le montant solde d'abord l'échéance non soldée la plus ancienne du
contrat, puis la suivante, jusqu'à épuisement. Le reliquat éventuel reste « non affecté » et visible
comme avance sur la fiche locataire.

### Génération mensuelle
Une tâche planifiée crée, le 1er de chaque mois, une échéance pour chaque contrat actif à partir du
loyer du contrat. Idempotente : relancer deux fois ne crée pas de doublon.

## Écrans

1. **Impayés** → liste d'échéances non soldées (une ligne = un mois d'un contrat), filtres période,
   statut (Impayé / Partiel / Soldé / En contentieux / Transféré au juridique), bien, locataire.
   Les KPI actuels sont recalculés sur les échéances.
2. **Fiche locataire** → bloc « Situation locative » (total dû / total payé / solde) et détail
   période par période avec pastille de statut.
3. **Décompte locatif** → grand livre : date, désignation, période concernée, débit, crédit, solde
   cumulé ; consultable à l'écran et exportable.
4. **Saisie de paiement** → nouvel écran : montant, date, moyen, aperçu de l'affectation FIFO avant
   validation, et réaffectation manuelle réservée à l'admin.

## Plan de migration (par étapes, validation à chaque palier)

**Étape 0 — Sauvegarde.** Export CSV horodaté de `contrats`, `impayes`, `impayes_historique`,
`impayes_statut_historique`, `impayes_commentaires` dans un dossier de documents, plus conservation
intégrale des tables `impayes*` (aucune suppression à cette étape).
Note : la plateforme ne me permet pas de déclencher un dump binaire complet de la base ; la sauvegarde
automatique quotidienne de l'hébergement reste votre filet de sécurité, et je conserve en plus les
tables sources telles quelles.

**Étape 1 — Création du schéma** (tables, contrôles, RLS, triggers), sans aucune donnée. Les écrans
actuels continuent de fonctionner sur `impayes`.

**Étape 2 — Reconstitution à blanc + rapport de contrôle.** Génération des échéances et affectations
dans les nouvelles tables, puis rapport comparatif que je vous présente avant toute bascule :
- total dû par contrat, ancien vs nouveau
- total payé par contrat, ancien vs nouveau
- solde par contrat, ancien vs nouveau
- liste des écarts ligne à ligne

Règles de reconstitution :
- une échéance par mois entre le début du contrat et sa fin (ou le mois courant), au montant du loyer
- si une ligne `impayes` existe pour ce contrat et cette échéance, son `montant_du` et ses champs de
  procédure priment sur le loyer théorique
- le `montant_paye` de chaque ligne `impayes` devient un paiement daté de `date_dernier_paiement`
  (ou de la date d'échéance à défaut), affecté à l'échéance correspondante — pas de FIFO aveugle là
  où l'affectation est déjà connue
- les mois antérieurs sans trace d'impayé sont considérés soldés : un paiement de régularisation les
  couvre, pour ne pas créer de dette qui n'existe pas aujourd'hui

**Étape 3 — Bascule des écrans** une fois le rapport validé par vous, avec conservation des tables
`impayes*` en lecture (commentaires et historiques repris sur les échéances).

**Étape 4 — Retrait de l'ancien modèle**, uniquement après une période d'observation que vous jugez
suffisante.

## Points à confirmer avant l'étape 1

1. Faut-il reconstituer l'historique depuis 2016 (~4 500 échéances) ou seulement depuis une date
   pivot (ex. 01/01/2025), les périodes antérieures étant réputées soldées ?
2. Le dépôt de garantie et les charges doivent-ils générer leurs propres échéances, ou uniquement le
   loyer mensuel ?
3. La date d'échéance est-elle le 1er du mois pour tous les contrats, ou un autre jour ?
