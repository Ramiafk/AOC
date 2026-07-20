# Lot 5F — Dossier réglementaire de cession

## Objectif

Après le transfert de propriété, constituer une seule fois le dossier remis à l'acquéreur. Il contient un certificat de cession et un procès-verbal de remise déjà enregistrés dans le module Documents et rattachés au véhicule.

## Invariants

- le véhicule est livré et son transfert de propriété existe ;
- les deux documents sont distincts ;
- leurs types sont respectivement `cession_certificate` et `delivery_receipt` ;
- les documents appartiennent au même actif que le transfert ;
- les documents appartiennent au nouvel acquéreur ;
- un seul dossier peut être émis par véhicule en stock ;
- le verrou pessimiste est acquis avant les lectures métier ;
- dossier et événement de notification sont écrits dans une transaction unique.

## API

`POST /v1/vehicle-stock/:id/cession-dossier`

```json
{
  "certificateDocumentId": "00000000-0000-4000-8000-000000000000",
  "deliveryReceiptDocumentId": "00000000-0000-4000-8000-000000000001"
}
```

La route exige `commerce.manage` et résout le périmètre organisation/site à partir du stock opaque avant exécution.

## Persistance et notification

La migration immuable `023_vehicle_cession_dossiers.sql` ajoute la table tenant-scoped, son unicité par stock, ses FK composites et la RLS forcée. La FK vers le transfert inclut l'actif et le nouvel acquéreur. Les FK documentaires incluent également l'actif et le propriétaire, empêchant PostgreSQL d'accepter un dossier avec les pièces d'un autre véhicule ou encore détenues par le vendeur. L'émission produit atomiquement `commerce.vehicle_cession_dossier_issued.v1` avec le client, l'actif, les deux documents et le topic `document`. Le dispatcher de notifications consommera cet événement sans coupler le domaine Commerce à un fournisseur de messagerie.

## Tests

Les tests couvrent le parcours nominal, l'ordre transfert → dossier, les types documentaires, le propriétaire acquéreur, l'erreur métier stable sur répétition, la concurrence, la route scoped, l'outbox transactionnelle et les rejets PostgreSQL d'un dossier croisant organisation, site, actif, acquéreur ou documents.

## Limites

Le rendu binaire et la signature électronique des PDF restent des ports externes ; ce lot gère leurs métadonnées vérifiables et leur orchestration, sans intégrer de fournisseur propriétaire.
