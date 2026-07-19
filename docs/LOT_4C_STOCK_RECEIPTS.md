# Lot 4C — Fournisseurs, réceptions et valorisation

## Objectif

Relier l'approvisionnement au stock réel : un fournisseur appartient à une organisation, une commande cible un site, et chaque réception augmente le stock tout en recalculant son coût moyen pondéré.

## Règles métier

- une commande ne peut utiliser qu'un fournisseur et des pièces de sa propre organisation ;
- seule une commande envoyée peut être réceptionnée ;
- les réceptions partielles sont permises, jamais au-delà de la quantité commandée ;
- une même pièce ne peut apparaître qu'une fois dans une commande ou une réception ;
- la commande est verrouillée avant de lire son état, les réceptions antérieures et les positions ; le contrôle du reliquat, la valorisation et toutes les écritures restent dans cette même transaction ;
- la valorisation utilise un coût moyen pondéré entier en centimes ;
- les routes résolvent le périmètre organisation/site avant les actions sur un identifiant opaque.

## Base de données

La migration `015_suppliers_receipts_valuation.sql` ajoute les fournisseurs, réceptions, lignes de réception et le coût moyen aux positions. Toutes les relations métier sont protégées par des clés étrangères composites tenant-scoped et les nouvelles tables utilisent RLS. L'adaptateur PostgreSQL ouvre une transaction tenant-scoped pour chaque opération et positionne `app.tenant_id` avec `set_config` avant toute requête. Le test d'intégration exécute l'adaptateur avec un rôle LOGIN non-superuser soumis à `FORCE ROW LEVEL SECURITY`.

## Limites

- pas encore de retours fournisseur ni d'avoirs ;
- pas de gestion des reliquats annulés ;
- coût moyen pondéré seulement, sans FIFO/LIFO ;
- les devises fournisseurs et frais d'approche seront traités dans une tranche ultérieure.
