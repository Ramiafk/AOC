# Lot 4D — Reliquats, retours fournisseur et réapprovisionnement

## Objectif

Fermer explicitement les reliquats non livrés, retourner au fournisseur des pièces effectivement reçues et signaler les références dont le stock disponible atteint le seuil de réapprovisionnement.

## Règles métier

- un reliquat ne peut être fermé que sur une commande envoyée ou partiellement reçue ;
- une commande partiellement reçue passe à `closed`, tandis qu'une commande sans réception passe à `cancelled` ;
- un retour fournisseur ne peut dépasser le total reçu diminué des retours antérieurs ;
- seules les quantités en stock non réservées peuvent être retournées ;
- une pièce ne peut apparaître qu'une fois dans un même retour et un motif est obligatoire ;
- le verrou de commande est acquis avant la lecture des réceptions, retours et positions ;
- le retour, ses lignes, la diminution du stock et l'événement outbox sont atomiques ;
- une alerte est calculée lorsque `on_hand - reserved <= reorder_point`, y compris pour une pièce active sans position de stock.

## Sécurité et base de données

Les routes résolvent le périmètre de la commande avant autorisation et la liste des alertes exige les périmètres organisation et site. La migration `016_supplier_returns.sql` ajoute les retours et leurs lignes avec clés étrangères composites tenant-scoped, RLS forcée et index par commande. L'adaptateur PostgreSQL conserve le contexte `app.tenant_id` dans chaque transaction.

## Limites

- pas d'avoir financier fournisseur ni de remboursement dans cette tranche ;
- pas de document d'expédition ou d'étiquette transporteur ;
- les alertes sont calculées à la lecture et ne déclenchent pas encore automatiquement une commande ;
- le seuil et la quantité suggérée restent définis au niveau de la pièce, sans saisonnalité ni prévision de demande.
