# Lot 5D — Livraison et remise du véhicule

## Capacité livrée

Une vente peut être planifiée pour livraison puis clôturée par une remise physique auditable. La clôture conserve le kilométrage de remise, les observations, l'acteur et l'horodatage, passe le stock à `delivered` et émet `commerce.vehicle_delivered.v1` atomiquement.

## Invariants

- seule une vente finalisée peut être planifiée ;
- un véhicule ne possède qu'une livraison ;
- la planification et la clôture prennent le verrou du stock avant leurs lectures ;
- seul un dossier `scheduled` peut être clôturé ;
- le kilométrage est un entier positif ou nul ;
- livraison, vente, stock, organisation et site sont liés par une FK composite ;
- la clôture, le statut du stock et l'outbox partagent une transaction.

## API

- `POST /v1/vehicle-stock/:id/delivery` avec `plannedAt` ISO 8601 ;
- `POST /v1/vehicle-stock/:id/delivery/complete` avec `handoverOdometerKm` et `notes` facultatives.

Les deux routes exigent `commerce.manage` dans l'organisation et le site du stock.

## PostgreSQL

La migration immuable `021_vehicle_deliveries.sql` ajoute l'état de stock `delivered`, la table `vehicle_deliveries`, la RLS forcée et une FK composite vers la vente portant tenant, organisation, site et véhicule.

## Tests

- parcours métier planification → remise ;
- planification concurrente unique ;
- parcours HTTP scoped ;
- transaction PostgreSQL avec rôle applicatif non-superuser ;
- outbox de remise ;
- rejet PostgreSQL d'une livraison croisant organisation et site.

## Limites assumées

Le procès-verbal signé, les documents réglementaires, la mutation du propriétaire du passeport et les notifications client seront livrés par les lots documentaire et passeport suivants.
