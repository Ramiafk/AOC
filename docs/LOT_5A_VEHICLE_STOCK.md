# Lot 5A — Stock de véhicules et publication multicanal

## Objectif

Faire entrer un actif existant dans le stock commercial d'un professionnel, suivre sa préparation, définir son prix de vente et le publier indépendamment sur le site, l'application directe ou la plateforme centrale.

## Règles métier

- l'actif, le site et l'organisation doivent appartenir au tenant courant ;
- un actif ne peut apparaître qu'une fois dans le stock commercial d'un tenant ;
- le parcours est `acquired → preparing → ready → published` ;
- le prix demandé est obligatoire et strictement positif avant publication ;
- un même canal ne peut avoir qu'une publication active par véhicule ;
- les publications concurrentes sont sérialisées par verrou de ligne ;
- la publication, le statut du stock et l'événement outbox sont enregistrés atomiquement ;
- les canaux direct professionnel et plateforme centrale restent explicitement distincts.

## Sécurité et base de données

Les routes résolvent le périmètre organisation/site avant chaque action sur un identifiant opaque. La migration `017_vehicle_commerce.sql` crée `vehicle_stock_items` et `vehicle_publications` avec RLS forcée, unicité par actif et par canal, et index de consultation. La migration corrective et immuable `018_vehicle_commerce_scope_constraints.sql` impose en plus les relations composites tenant/organisation/site pour le stock et tenant/organisation/site/stock pour chaque publication.

## Limites

- pas encore de fiche média, contrôle de préparation détaillé ou calcul de marge complet ;
- pas de retrait de publication ni de vente dans cette tranche ;
- pas de diffusion vers un fournisseur d'annonces externe ;
- la reprise, le financement et la livraison seront traités dans les tranches suivantes du lot 5.
