# Profils d'exécution

## development

`npm run start:dev` utilise uniquement les dépôts mémoire et un jeton explicitement préfixé `DEV_`. Le bootstrap refuse de démarrer lorsque `NODE_ENV=production`.

## test

Les tests unitaires utilisent les adaptateurs mémoire. La CI fournit PostgreSQL 17 pour exécuter les migrations et vérifier réellement RLS, les clés composites, le rollback et l'outbox transactionnelle.

## production

`npm run start:api` exige PostgreSQL et OIDC (`DATABASE_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`). Les variables `DEV_*` provoquent un arrêt immédiat. Aucun dépôt mémoire ni vérificateur de jeton statique n'est instancié par ce point d'entrée.
