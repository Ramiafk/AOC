# AOC — Garde-fous techniques

## Architecture

- Monorepo modulaire ; les modules métier ne dépendent pas des frameworks HTTP ni des adaptateurs PostgreSQL.
- Une racine de composition explicite assemble les capacités.
- Les routes, schémas, services et repositories sont découpés par domaine.
- Les contrats inter-modules passent par des interfaces, événements versionnés ou services applicatifs explicites.
- Les canaux plateforme centrale, site professionnel, application professionnelle et application client restent distincts.
- Le modèle de base est `asset/vehicle` ; les particularités voiture, moto, quad, bateau ou autre sont des extensions.

## Isolation et autorisation

- Toute donnée métier est tenant-scoped.
- Les ressources organisation/site utilisent des FK composites et des autorisations après résolution de la ressource opaque.
- PostgreSQL active et force la RLS sur les tables sensibles.
- Les tests utilisent un rôle applicatif non-superuser pour prouver la RLS.
- Les routes ne font pas confiance aux identifiants organisation/site fournis par le client lorsqu’ils peuvent être dérivés de la ressource.

## Transactions et concurrence

- Le verrou est acquis avant toute lecture utilisée dans une décision sensible.
- Toutes les lectures et écritures après verrou utilisent le repository transaction-scoped.
- L’état métier, les écritures associées et l’outbox sont atomiques.
- Les contraintes SQL constituent une dernière ligne de défense, pas un remplacement du domaine.
- Les doubles commandes retournent une erreur métier stable ou un résultat idempotent.
- Les tests concurrents vérifient la cardinalité exacte des lignes et événements.

## PostgreSQL et migrations

- Les migrations fusionnées sont immuables ; une correction utilise une migration suivante.
- Toute modification d’une table peuplée dispose d’un scénario d’upgrade depuis la version précédente.
- Les colonnes `NOT NULL`, contraintes et FK sont introduites progressivement lorsque des lignes historiques existent.
- Aucune fausse donnée rétroactive n’est créée pour satisfaire une nouvelle contrainte.
- Les FK composites protègent les relations tenant/organisation/site/ressource et les identités métier liées.
- Les statuts et invariants durables sont protégés par `CHECK`, `UNIQUE` et index partiels adaptés.
- Les requêtes importantes disposent d’index justifiés par leur filtre et leur ordre.

## API et erreurs

- Les entrées sont validées avant le domaine.
- Les erreurs métier possèdent un code stable et une traduction HTTP cohérente.
- Les erreurs PostgreSQL attendues sont converties en erreurs métier lorsqu’elles représentent une concurrence ou une idempotence normale.
- Les ressources opaques sont résolues dans le tenant avant l’autorisation organisation/site.
- Les opérations critiques acceptent une clé d’idempotence lorsque des retries réseau sont probables.

## Événements et outbox

- Les événements sont versionnés, par exemple `domain.action.v1`.
- L’outbox est écrite dans la transaction de l’état source.
- Le payload contient les identifiants de périmètre nécessaires sans exposer de données sensibles inutiles.
- Un événement n’est émis qu’une fois pour l’opération gagnante.
- Les consommateurs sont idempotents et suivent les tentatives, erreurs et dead letters.

## Sécurité

- Principe du moindre privilège pour utilisateurs, services, runners et GitHub Apps.
- Aucun secret, token, donnée de carte ou document privé dans le dépôt et les logs.
- Les uploads sont validés par type réel, taille, antivirus, stockage privé et URL temporaires.
- Les webhooks sont signés, horodatés, rejouables de manière sûre et idempotents.
- Les paiements ne stockent que des références prestataire et états vérifiés.
- Les dépendances et actions GitHub sont épinglées ou contrôlées selon le niveau de risque.
- Les PR de forks n’exécutent jamais de code avec secrets ou token d’écriture.

## Vie privée

- Minimisation des données et finalité documentée.
- Consentements, préférences, rétention, export et suppression sont auditables.
- Les données partagées entre professionnels possèdent une audience et une base explicites.
- Les journaux d’audit protègent l’intégrité sans recopier inutilement des données personnelles.

## Tests

Chaque lot sélectionne les niveaux pertinents :

- tests domaine pour les invariants ;
- tests API pour validation, permissions et erreurs ;
- tests PostgreSQL pour RLS, FK, transactions, index uniques et concurrence ;
- tests d’upgrade pour les migrations de tables existantes ;
- tests de contrat pour les événements et intégrations ;
- tests web/mobile pour états, permissions, accessibilité et régression visuelle ;
- tests de charge ciblés pour les chemins concurrentiels et listes importantes.

Un test mémoire ne prouve pas une garantie PostgreSQL.

## Observabilité et exploitation

- Corrélation requête/commande/événement.
- Métriques de latence, erreur, retry, file d’attente, outbox et jobs.
- Logs structurés sans secrets ni données sensibles non nécessaires.
- Alertes orientées symptômes utilisateur et SLO.
- Sauvegardes testées, restauration documentée et migrations réversibles par stratégie de correction.
- Développement et production utilisent des points d’entrée et configurations séparés.

## Frontend, mobile et design

- Design tokens partagés et thèmes par professionnel.
- Composants accessibles et responsive.
- États loading, vide, erreur, permission refusée, offline et retry.
- Les formulaires préservent les données lors d’un échec récupérable.
- Les écrans affichent clairement l’audience, le professionnel responsable et la portée des données.
- Les captures de référence et tests visuels accompagnent les changements majeurs.

## Revue autonome

Les agents ne peuvent modifier ces garde-fous que dans une PR de gouvernance explicite. Le CTO doit refuser toute tentative de contourner une règle pour accélérer une livraison ou obtenir une CI verte.
