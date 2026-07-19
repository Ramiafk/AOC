# Lot 5E — Transfert de propriété du véhicule

## Résultat livré

Après la remise d'un véhicule vendu, l'équipe habilitée peut transférer sa propriété à l'acheteur. L'opération exige au moins un document rattaché à l'actif et met à jour, dans une transaction unique, le propriétaire de l'actif, le propriétaire du passeport, l'historique du passeport et l'outbox.

## Invariants

- le véhicule doit être dans l'état `delivered` ;
- la vente et la livraison terminée doivent appartenir au même tenant, à la même organisation, au même site et au même stock ;
- le nouveau propriétaire est l'acheteur de la vente ;
- chaque justificatif doit appartenir à l'actif transféré ;
- un seul transfert est autorisé par véhicule en stock ;
- le verrou pessimiste du stock est acquis avant les lectures métier ;
- les mutations de l'actif, du passeport, de l'historique et de l'outbox sont atomiques.

## API

`POST /v1/vehicle-stock/:id/ownership-transfer`

```json
{
  "documentIds": ["00000000-0000-4000-8000-000000000000"]
}
```

La route exige la permission `commerce.manage` ainsi que l'accès à l'organisation et au site du véhicule.

## Persistance et sécurité

La migration `022_vehicle_ownership_transfers.sql` crée les transferts et leurs justificatifs. Les clés étrangères composites empêchent une cession inter-organisation ou inter-site au sein d'un même tenant. Les deux tables activent et forcent la RLS tenant-scoped.

## Vérification

Les tests couvrent le parcours nominal, l'absence ou l'inadéquation des justificatifs, l'appel avant livraison, la répétition du transfert, la mutation de l'actif et du passeport, l'entrée d'historique, l'outbox et une tentative PostgreSQL inter-organisation/inter-site.
