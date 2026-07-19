# Lot 4C — Fournisseurs, réceptions et valorisation

## Objectif

Relier l'approvisionnement au stock réel : un fournisseur appartient à une organisation, une commande cible un site, et chaque réception augmente le stock tout en recalculant son coût moyen pondéré.

## Règles métier

- une commande ne peut utiliser qu'un fournisseur et des pièces de sa propre organisation ;
- seule une commande envoyée peut être réceptionnée ;
- les réceptions partielles sont permises, jamais au-delà de la quantité commandée ;
- la réception, ses lignes, la mise à jour des positions et le statut de commande sont enregistrés dans une transaction ;
- la valorisation utilise un coût moyen pondéré entier en centimes ;
- les routes résolvent le périmètre organisation/site avant les actions sur un identifiant opaque.

## Base de données

La migration `015_suppliers_receipts_valuation.sql` ajoute les fournisseurs, réceptions, lignes de réception et le coût moyen aux positions. Toutes les relations métier sont protégées par des clés étrangères composites tenant-scoped et les nouvelles tables utilisent RLS.

## Limites

- pas encore de retours fournisseur ni d'avoirs ;
- pas de gestion des reliquats annulés ;
- coût moyen pondéré seulement, sans FIFO/LIFO ;
- les devises fournisseurs et frais d'approche seront traités dans une tranche ultérieure.
