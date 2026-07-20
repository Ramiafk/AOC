# Lot 5I — Garanties d'enchères

## Résultat livré

Une offre d'enchère véhicule exige désormais une garantie préalablement autorisée pour le même tenant, la même organisation, le même site, la même enchère et le même enchérisseur.

Le montant et la devise sont définis lors de la programmation de l'enchère. Par défaut, la garantie correspond au maximum entre 500 € et 5 % du prix de départ. L'autorisation référence la confirmation du prestataire de paiement, sans stocker de donnée de carte. Un replay idempotent ne retourne l'autorisation précédente que si son payload canonique (périmètre, enchérisseur, prestataire, référence, montant et devise) est strictement identique ; toute collision produit l'erreur stable `AUCTION_GUARANTEE_IDEMPOTENCY_CONFLICT`.

## Invariants

- une seule garantie `authorized` peut exister par enchérisseur et enchère ;
- une offre référence obligatoirement la garantie du même enchérisseur ;
- l'autorisation doit correspondre exactement au montant et à la devise de l'enchère ;
- à l'adjudication, la garantie gagnante est capturée et les autres sont libérées ;
- sans adjudication, lors d'une vente directe ou d'un retrait, toutes les garanties ouvertes sont libérées ;
- chaque autorisation, capture ou libération produit un événement outbox dans la transaction métier ;
- les tables sont protégées par RLS forcée et par des clés étrangères composites de périmètre.

## Compatibilité de migration 5H → 5I

La migration immuable `027` ne fabrique aucune autorisation de paiement rétroactive. Les enchères et offres créées avant son application sont marquées comme historiques (`guarantee_required = false`) et conservent un `guarantee_id` nul. Elles restent consultables et peuvent être clôturées normalement afin de préserver l'historique 5H.

Après la migration, chaque nouvelle enchère est créée avec `guarantee_required = true`. Une nouvelle offre hérite également de ce mode et PostgreSQL exige alors une garantie réelle du même enchérisseur. Il est volontairement impossible d'ajouter une nouvelle offre à une enchère historique non garantie.

## API

`POST /v1/vehicle-stock/:id/auctions/:auctionId/guarantees`

Le corps contient `bidderCustomerId`, `provider`, `providerReference`, `idempotencyKey`, `amountCents` et `currency`.

## Limite volontaire

Ce lot enregistre une autorisation déjà confirmée par un prestataire. L'adaptateur PSP réel, la signature des webhooks et les reprises automatiques après incident relèvent du lot connecteur paiement. Le modèle ne conserve aucun PAN, cryptogramme ou secret bancaire.

## Vérification

- tests métier : garantie obligatoire, replay canonique, conflits d'idempotence, capture gagnante, libération des perdants et clôture sans vente ;
- tests HTTP : autorisation avant offre, refus organisation/site et libération lors d'une vente directe ;
- tests PostgreSQL : montée peuplée 026→027, montant/devise incohérents, RLS inter-tenant, périmètre organisation/site, statuts finaux et outbox ;
- CI PostgreSQL 17 : typecheck, tests, migrations et contrôles d'architecture.
