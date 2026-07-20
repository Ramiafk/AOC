# Lot 5G — ventes flash configurables

## Objectif

Programmer une réduction temporaire sur un véhicule déjà publié, sur un ou plusieurs canaux où il est réellement visible, sans modifier son prix catalogue ni introduire le moteur d'enchères.

## Invariants métier

- le véhicule doit être `published` et avoir un prix affiché ;
- le prix flash est positif et strictement inférieur au prix affiché ;
- le début ne peut pas être passé et la fin est postérieure au début ;
- chaque canal ciblé possède une publication active ;
- une seule vente flash ouverte peut exister par véhicule ;
- programmation et annulation prennent le verrou pessimiste du stock avant toute lecture métier.

## Persistance et sécurité

La migration immuable `024_vehicle_flash_sales.sql` ajoute :

- une FK composite `(tenant, organisation, site, stock)` ;
- une unicité partielle pour une seule vente flash `scheduled` ;
- des contraintes sur la fenêtre, le statut, l'annulation et les canaux ;
- un index de lecture par périmètre et fenêtre ;
- une RLS activée et forcée.

La programmation ou l'annulation et leur événement outbox sont écrits dans une transaction unique tenant-scoped. Les routes résolvent le stock opaque avant d'appliquer `commerce.manage` aux périmètres organisation et site.

## API

- `POST /v1/vehicle-stock/:id/flash-sales` programme une vente flash ;
- `POST /v1/vehicle-stock/:id/flash-sales/cancel` annule la vente flash ouverte.

## Tests

Les tests couvrent le cas nominal, les prix et fenêtres invalides, un canal non publié, la double programmation concurrente, l'annulation, les routes HTTP, la RLS et une FK négative inter-organisation/inter-site sous PostgreSQL.

## Limites

Le lot ne contient ni enchère, ni adjudication, ni tâche automatique de changement de statut. La fenêtre ISO est la source de vérité : les consommateurs déterminent si une vente programmée est active à l'instant de lecture. Les enchères configurables feront l'objet d'un lot distinct après validation de 5G.
