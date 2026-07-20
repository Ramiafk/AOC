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
- une campagne dont `endsAt` est dépassé est clôturée en `expired` avant la lecture ou la mutation suivante ;
- la vente ou le retrait du véhicule clôture atomiquement toute campagne encore ouverte avec le motif correspondant.

## Persistance et sécurité

La migration immuable `024_vehicle_flash_sales.sql` ajoute :

- une FK composite `(tenant, organisation, site, stock)` ;
- une unicité partielle pour une seule vente flash `scheduled`, libérée lors de l'expiration sans supprimer l'historique ;
- des contraintes sur la fenêtre, les statuts `scheduled`, `cancelled`, `expired`, `closed`, les motifs de clôture et les canaux ;
- un index de lecture par périmètre et fenêtre ;
- une RLS activée et forcée.

La programmation ou l'annulation et leur événement outbox sont écrits dans une transaction unique tenant-scoped. Les routes résolvent le stock opaque avant d'appliquer `commerce.manage` aux périmètres organisation et site.

## API

- `POST /v1/vehicle-stock/:id/flash-sales` programme une vente flash ;
- `POST /v1/vehicle-stock/:id/flash-sales/cancel` annule la vente flash ouverte.
- `POST /v1/vehicle-stock/:id/withdraw` retire le véhicule et clôture ses publications et sa campagne flash dans la même transaction.

## Tests

Les tests couvrent le cas nominal, les prix et fenêtres invalides, un canal non publié, la double programmation concurrente, l'annulation, l'expiration avec horloge avancée, l'enchaînement d'une nouvelle campagne, la clôture sur vente ou retrait, les routes HTTP, la RLS et une FK négative inter-organisation/inter-site sous PostgreSQL.

## Limites

Le lot ne contient ni enchère ni adjudication. L'expiration est matérialisée atomiquement lors de la prochaine commande verrouillée sur le véhicule ; aucun ordonnanceur périodique n'est introduit. Les consommateurs considèrent néanmoins la fenêtre ISO comme source de vérité et n'exposent jamais une campagne après `endsAt`. Les enchères configurables feront l'objet d'un lot distinct après validation de 5G.
