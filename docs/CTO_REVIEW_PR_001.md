# Revue CTO — PR #1

Statut: REQUEST CHANGES

## Résumé

Le socle est prometteur et cohérent avec la vision AOS: modular monolith, domaines séparés, multi-tenant, RBAC, PostgreSQL, outbox et documentation ADR. La PR ne doit cependant pas être fusionnée en l'état.

## Points bloquants

### 1. Autorisation insuffisamment contextualisée

`RouteAuthorizer.require` vérifie une permission globale de membership, mais les routes acceptent ensuite librement des `organizationId`, `siteId`, `customerId`, `assetId` et autres identifiants. Il manque une vérification systématique que la ressource demandée appartient bien à l'organisation et au périmètre de sites autorisés pour le membre.

Conséquence: un utilisateur disposant d'une permission dans une organisation pourrait tenter d'agir sur une autre organisation du même tenant en fournissant son identifiant.

Attendu:
- introduire un contexte de portée explicite (`organizationId`, `siteId`);
- vérifier cette portée dans l'autoriseur et/ou dans chaque use case;
- ajouter des tests négatifs d'accès inter-organisation et inter-site.

### 2. Intégrité multi-tenant non garantie par les clés étrangères

Les tables portent `tenant_id`, mais plusieurs relations référencent uniquement l'identifiant de la table cible. Exemples: `sites.organization_id`, `customers.acquisition_owner_organization_id`, `assets.owner_customer_id`.

La RLS ne remplace pas une contrainte d'intégrité composite. La base doit empêcher structurellement toute relation croisée entre tenants.

Attendu:
- ajouter des contraintes uniques `(tenant_id, id)` sur toutes les tables cibles;
- remplacer les FK simples par des FK composites `(tenant_id, foreign_id)` vers `(tenant_id, id)`;
- ajouter des tests PostgreSQL réels démontrant qu'une relation cross-tenant est rejetée.

### 3. Absence de CI vérifiable

Aucun workflow GitHub Actions ni statut de contrôle n'est présent sur le commit. Les commandes annoncées dans la PR sont donc déclaratives mais non vérifiées par GitHub.

Attendu:
- workflow CI sur push et pull_request;
- installation reproductible (`npm ci`);
- `npm run typecheck`;
- `npm test`;
- `npm run check`;
- test de migrations sur PostgreSQL éphémère;
- statut obligatoire avant fusion.

### 4. Tests PostgreSQL insuffisants

Le test de migrations vérifie essentiellement l'ordre, le checksum et la présence textuelle de `ROW LEVEL SECURITY`. Il n'exécute pas les migrations et ne teste pas l'isolation réelle.

Attendu:
- démarrer PostgreSQL en CI;
- exécuter toutes les migrations;
- tester RLS avec deux tenants;
- tester les FK composites;
- tester rollback/échec de migration;
- tester l'outbox dans la même transaction que l'agrégat.

### 5. Composition API trop centralisée

`buildApp` concentre les schémas, l'enregistrement de toutes les routes et de nombreux services optionnels dans un seul fichier. Cette structure deviendra rapidement un point de couplage et de conflits.

Attendu:
- un plugin/route module Fastify par domaine;
- un schéma d'entrée par module;
- une composition racine légère;
- aucun module métier silencieusement absent selon qu'un paramètre optionnel est fourni ou non.

### 6. Serveur actuel non représentatif d'un démarrage production

`server.ts` démarre uniquement avec des dépôts in-memory, un vérificateur de token statique et une adhésion fabriquée à partir de variables DEV. C'est acceptable pour une démo locale, mais pas comme point d'entrée principal sans séparation explicite.

Attendu:
- renommer ce bootstrap en mode développement;
- créer une composition PostgreSQL/OIDC réelle;
- refuser le démarrage production si un adaptateur in-memory ou un token DEV est utilisé;
- documenter les profils `development`, `test`, `production`.

## Points importants non bloquants à traiter rapidement

- normaliser le formatage et découper les longues lignes de routes/tests;
- remplacer les casts TypeScript forcés par des parseurs métier sûrs;
- fournir OpenAPI généré depuis les schémas;
- uniformiser la traduction des erreurs métier en statuts HTTP;
- ajouter pagination, limites et filtres sécurisés aux endpoints de liste;
- ajouter rate limiting, taille maximale des payloads et journalisation structurée;
- séparer les permissions client/professionnel au lieu d'utiliser certaines permissions professionnelles pour des actions client;
- ajouter couverture et seuil minimal de tests.

## Points validés

- choix initial du modular monolith;
- séparation en packages métier;
- usage de ports et dépôts;
- OIDC avec issuer, audience et algorithmes explicitement limités;
- transaction PostgreSQL avec `SET LOCAL` via `set_config`;
- outbox écrite dans la transaction de l'actif;
- RLS activée et forcée;
- migrations versionnées;
- premiers tests RBAC, authentification et parcours API;
- ADR présents.

## Décision

Fusion interdite tant que les six points bloquants ne sont pas corrigés et démontrés par une CI verte.
