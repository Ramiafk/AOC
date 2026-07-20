# Lot 5I — Garanties d'enchères

## Résultat livré

Une offre d'enchère véhicule exige désormais une garantie préalablement autorisée pour le même tenant, la même organisation, le même site, la même enchère et le même enchérisseur.

Le montant et la devise sont définis lors de la programmation de l'enchère. Par défaut, la garantie correspond au maximum entre 500 € et 5 % du prix de départ. L'autorisation est idempotente par tenant et référence également la confirmation du prestataire de paiement, sans stocker de donnée de carte.

## Invariants

- une seule garantie `authorized` peut exister par enchérisseur et enchère ;
- une offre référence obligatoirement la garantie du même enchérisseur ;
- l'autorisation doit correspondre exactement au montant et à la devise de l'enchère ;
- à l'adjudication, la garantie gagnante est capturée et les autres sont libérées ;
- sans adjudication, lors d'une vente directe ou d'un retrait, toutes les garanties ouvertes sont libérées ;
- chaque autorisation, capture ou libération produit un événement outbox dans la transaction métier ;
- les tables sont protégées par RLS forcée et par des clés étrangères composites de périmètre.

## API

`POST /v1/vehicle-stock/:id/auctions/:auctionId/guarantees`

Le corps contient `bidderCustomerId`, `provider`, `providerReference`, `idempotencyKey`, `amountCents` et `currency`.

## Limite volontaire

Ce lot enregistre une autorisation déjà confirmée par un prestataire. L'adaptateur PSP réel, la signature des webhooks et les reprises automatiques après incident relèvent du lot connecteur paiement. Le modèle ne conserve aucun PAN, cryptogramme ou secret bancaire.

## Vérification

- tests métier : garantie obligatoire, capture gagnante, libération des perdants et clôture sans vente ;
- tests HTTP : autorisation avant offre et libération lors d'une vente directe ;
- tests PostgreSQL : incohérence enchérisseur/garantie rejetée, périmètre organisation/site rejeté, statuts finaux et outbox ;
- CI PostgreSQL 17 : typecheck, tests, migrations et contrôles d'architecture.
