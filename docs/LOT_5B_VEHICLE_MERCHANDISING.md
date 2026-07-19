# Lot 5B — Préparation commerciale et médias véhicule

## Objectif

Conditionner la mise en vente à une préparation vérifiable et à une présentation visuelle minimale, partagées entre le site professionnel, l'application directe et la plateforme centrale.

## Règles métier

- les contrôles de préparation sont créés pendant l'état `preparing` ;
- tous les contrôles obligatoires doivent être terminés avant l'état `ready` ;
- une image principale est obligatoire avant de fixer le véhicule comme prêt ;
- une seule image principale et une seule position média sont permises par véhicule ;
- le passage à `ready`, son prix et l'événement outbox sont atomiques sous verrou du stock ;
- les médias sont référencés par clé de stockage, jamais par contenu ou URL signée persistée.

## Base de données et sécurité

La migration `019_vehicle_merchandising.sql` ajoute les contrôles et médias avec RLS forcée et FK composite vers le stock sur tenant/organisation/site/stock. Des index ciblent les contrôles obligatoires en attente et garantissent une image principale unique.

## Limites

- l'upload binaire et la génération de variantes restent délégués à un futur connecteur média ;
- pas encore de modération, recadrage ni ordre automatique des photos ;
- les modèles de checklist par activité seront ajoutés ultérieurement.

## Correction de concurrence

Toutes les mutations de checklist et de médias prennent désormais le verrou du stock, relisent le statut dans la transaction verrouillée et écrivent via le repository transaction-scoped. Ainsi, une mutation tardive est soit sérialisée avant `markReady` et prise en compte par sa validation, soit rejetée après le passage à `ready`.
