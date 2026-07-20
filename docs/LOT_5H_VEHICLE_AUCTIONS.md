# Lot 5H — enchères véhicule configurables

## Objectif

Programmer une enchère sur un véhicule publié, accepter des offres concurrentes et clôturer la campagne avec une adjudication atomique lorsque le prix de réserve est atteint.

## Invariants métier

- le véhicule et le canal sont publiés ;
- prix de départ, réserve et incrément sont des montants entiers positifs ;
- la réserve est supérieure ou égale au prix de départ ;
- la fenêtre commence au présent ou dans le futur et possède une fin postérieure ;
- une seule enchère `scheduled` existe par véhicule ;
- les offres ne sont acceptées que dans la fenêtre et pour un client du tenant ;
- la première offre atteint le prix de départ, les suivantes dépassent la meilleure offre d'au moins l'incrément ;
- programmation, offres et clôture utilisent le même verrou pessimiste du stock.

## Clôture

Après `endsAt`, la meilleure offre gagne si elle atteint la réserve. En cas d'adjudication, l'enchère, la vente, le statut `sold`, le retrait des publications, la clôture d'une vente flash et les événements outbox sont écrits dans une transaction unique. Si la réserve n'est pas atteinte, l'enchère devient `unsold` et le véhicule reste publié.

L'identité du gagnant, l'auteur de l'offre gagnante et l'acheteur de la vente doivent être identiques. Le service et l'adaptateur PostgreSQL vérifient aussi que le prix de vente correspond au montant de l'offre gagnante avant toute mutation.

Une vente directe ou un retrait du véhicule clôture l'enchère `scheduled` avec le motif `direct_sale` ou `withdrawn`.

## API et sécurité

- `POST /v1/vehicle-stock/:id/auctions` ;
- `POST /v1/vehicle-stock/:id/auctions/:auctionId/bids` ;
- `POST /v1/vehicle-stock/:id/auctions/:auctionId/close`.

Les routes résolvent le stock opaque et exigent `commerce.manage` sur son organisation et son site. Cette première tranche est donc un moteur opéré par le professionnel ; l'identité client autonome de la future application centrale reste hors périmètre.

## PostgreSQL

La migration immuable `025_vehicle_auctions.sql` crée les enchères et offres avec RLS forcée, FK composites tenant/organisation/site/stock/enchère, lien différé vers l'offre gagnante, unicité partielle d'une enchère ouverte et index de classement des offres. La migration corrective immuable `026_vehicle_auction_winner_integrity.sql` lie par FK composite l'enchère, l'offre gagnante et son enchérisseur afin qu'un autre client ne puisse pas être déclaré gagnant.

## Tests

Les tests couvrent la tarification, la fenêtre, le canal, les incréments, les offres concurrentes, la réserve atteinte ou non, une seule clôture gagnante, l'adjudication transactionnelle, les sorties directes du stock, les routes HTTP, les rejets PostgreSQL inter-organisation/inter-site et le rejet d'un gagnant différent de l'auteur de l'offre gagnante.

## Limites

Pas de paiement de dépôt, prolongation anti-sniping, anonymisation publique ni identité client autonome dans ce lot. Ces capacités nécessitent les surfaces marketplace et paiement dédiées.
