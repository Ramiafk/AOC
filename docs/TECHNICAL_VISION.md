# AOC — Vision technique de référence

## 1. Architecture

AOC utilise par défaut un monolithe modulaire TypeScript avec PostgreSQL. Les frontières domaine, application, infrastructure et HTTP restent explicites. Un module possède ses contrats, routes, schémas, services, repositories, migrations et tests. Une extraction en microservice nécessite une ADR et un besoin mesurable.

Les dépendances pointent vers le domaine. Les fournisseurs externes restent derrière des ports et adaptateurs remplaçables.

## 2. Isolation et sécurité

Toute donnée métier est tenant-scoped. Lorsqu’une ressource appartient à une organisation ou à un site, cette relation est protégée à la fois dans l’application et dans PostgreSQL.

Exigences :

- résolution des identifiants opaques avant autorisation ;
- permissions explicites par action ;
- clés étrangères composites pour empêcher les incohérences de périmètre ;
- `ENABLE ROW LEVEL SECURITY` et `FORCE ROW LEVEL SECURITY` sur les tables concernées ;
- contexte `app.tenant_id` positionné dans la transaction applicative ;
- tests négatifs inter-tenant, inter-organisation, inter-site et inter-audience ;
- aucun secret, PAN, cryptogramme ou credential fournisseur dans le dépôt ou les données métier.

## 3. Transactions et concurrence

Une opération critique doit prendre son verrou avant les lectures qui fondent la décision métier. Toutes les relectures et écritures utilisent le repository lié à la même transaction.

Les opérations couplées — état, finance, historique, documents et événements — sont atomiques. Les contraintes PostgreSQL servent de dernier rempart, pas de remplacement aux règles métier.

Les tests concurrents doivent prouver la cardinalité finale : une vente, une attribution, une réception, un dossier ou un événement selon l’invariant.

## 4. Événements et outbox

Les événements critiques sont écrits dans l’outbox dans la même transaction que l’agrégat. Les consommateurs sont idempotents, observables et capables de retry borné. Les intégrations externes ne doivent jamais être appelées à l’intérieur d’une transaction longue.

## 5. Migrations PostgreSQL

Les migrations fusionnées sont immuables. Toute correction utilise une nouvelle version.

Une migration sur table existante doit être testée sur :

1. une base vide ;
2. une base migrée jusqu’à la version précédente ;
3. des données historiques réalistes ;
4. l’application de la nouvelle migration ;
5. la lecture et la clôture des données anciennes ;
6. les nouvelles contraintes sur les nouvelles écritures.

Aucune fausse donnée rétroactive ne doit être créée pour satisfaire artificiellement une nouvelle contrainte.

## 6. API

L’API est versionnée sous `/v1`. Les routes restent fines : parsing, contexte, autorisation, appel applicatif et réponse. Les paramètres et corps sont validés. Les erreurs métier ont des codes stables. Les détails internes et données sensibles ne sont jamais renvoyés dans les erreurs 500.

## 7. Frontend, marque blanche et design

Les surfaces partagent des contrats types et un système de design configurable : tokens, typographie, espacements, composants, thèmes, logos, domaines et contenus. Les expériences client ne sont jamais obtenues par fork.

Les écrans doivent gérer : chargement, vide, erreur, absence de permission, données partielles, hors ligne lorsque pertinent, clavier, lecteur d’écran et responsive.

Les SVG et spécifications sont versionnés dans le dépôt. Les images raster générées sont optionnelles et ne doivent pas être une dépendance du fonctionnement métier.

## 8. Tests

La pyramide minimale comprend :

- tests domaine ;
- tests application ;
- tests HTTP ;
- tests PostgreSQL réels ;
- tests RLS et permissions ;
- tests concurrence ;
- tests migrations peuplées ;
- tests outbox et rollback ;
- tests frontend/accessibilité lorsque la surface existe.

Un repository mémoire ne prouve pas le verrouillage, les FK, la RLS ou les transactions PostgreSQL.

## 9. Observabilité et exploitation

Chaque action critique porte un identifiant de corrélation. Les métriques, logs et traces ne contiennent pas de données sensibles. Les jobs, webhooks et consommateurs exposent succès, échecs, retries et dead-letter.

Les déploiements futurs doivent disposer de health checks, rollback, sauvegarde, restauration testée, SLO et procédure d’incident.

## 10. Gouvernance multi-agents

L’automatisation applique la séparation des pouvoirs :

- agents produit et métier : spécification ;
- agents design : UX/UI et artefacts ;
- agents d’implémentation : code et tests ;
- QA : couverture et scénarios adverses ;
- reviewers sécurité, finance, conformité, accessibilité et performance : lecture seule ;
- CTO : décision liée au SHA exact ;
- orchestrateur : état GitHub, CI et fusion.

Les agents d’implémentation ne peuvent pas modifier :

- `AGENTS.md` ;
- `config/agents/` ;
- `scripts/agents/` ;
- `.github/workflows/autonomous-delivery.yml`.

Une approbation est invalidée dès que le SHA change. La fusion exige une CI verte sur le même SHA.

## 11. Limites d’autonomie

Le développement et la revue sont autonomes. Les actions externes irréversibles restent des human gates : création ou rotation de secret de production, premier déploiement, suppression destructive, contrat ou credentials live d’un PSP, dépôt réglementaire, achat de domaine ou engagement financier externe.
