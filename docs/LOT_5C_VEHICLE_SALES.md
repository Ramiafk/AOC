# Lot 5C — Vente de véhicules

## Capacité livrée

Un véhicule publié peut être vendu à un client du tenant. La commande de vente verrouille le stock avant toute lecture métier, calcule la marge brute, enregistre la vente, passe le véhicule à l'état `sold`, retire toutes ses annonces actives et émet `commerce.vehicle_sold.v1` dans la même transaction.

## Invariants

- seuls les véhicules `published` sont vendables ;
- le prix de vente est strictement positif ;
- l'acheteur doit appartenir au tenant ;
- une seule vente peut exister par véhicule ;
- la vente conserve l'organisation et le site du stock grâce à une FK composite ;
- deux ventes concurrentes ne peuvent pas aboutir ;
- vente, retrait des annonces, changement de statut et outbox sont atomiques.

## API

`POST /v1/vehicle-stock/:id/sale`

```json
{
  "buyerCustomerId": "00000000-0000-4000-8000-000000000000",
  "salePriceCents": 2450000
}
```

La route exige `commerce.manage` dans l'organisation et le site portés par le véhicule.

## PostgreSQL

La migration immuable `020_vehicle_sales.sql` crée `vehicle_sales`, active et force la RLS tenant, interdit les ventes multiples d'un même stock et ajoute les FK composites vers le stock et l'acheteur.

## Tests

- calcul de marge et retrait multicanal ;
- rejet d'une seconde vente ;
- concurrence : une seule transaction gagnante ;
- rôle applicatif PostgreSQL non-superuser avec contexte RLS ;
- rejet PostgreSQL d'une vente portant un couple organisation/site incohérent ;
- parcours HTTP autorisé et validé par schéma.

## Limites assumées

La livraison, le procès-verbal de remise, la mutation de propriété du passeport, le financement et l'annulation comptable sont prévus dans les tranches suivantes.
