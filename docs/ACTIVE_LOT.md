# AOC — État de livraison autonome

GitHub Issues, les labels, les PR et leurs SHA constituent la source de vérité dynamique. Ce fichier décrit seulement le point de reprise initial.

## Dernier lot fusionné

- Lot : 5I — Garanties d’enchères
- PR : #14
- Commit de fusion : `82e6f079b6223b61c6cb31afb9b8408d3f78f40e`
- État : `MERGED`

## Prochain lot éligible

- Lot : 5J — Cycles d’enchères de 24 h sur trois jours
- Dépendance : 5I fusionné
- État initial : `READY_AFTER_GOVERNANCE_MERGE`

## Règle

Après fusion de l’infrastructure autonome, l’orchestrateur crée ou retrouve l’issue 5J, la marque `agent:ready`, puis démarre une seule branche et une seule PR.
