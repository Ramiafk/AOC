# Lot autonome actif

## Point de reprise

- Dernier lot fusionné : 5I — Garanties d’enchères
- Commit de fusion : `82e6f079b6223b61c6cb31afb9b8408d3f78f40e`
- Prochain lot planifié : 5J — Cycles d’enchères de 24 h sur trois jours
- Issue existante : #16
- Source de la roadmap multi-agents : `config/agents/roadmap.json`
- Orchestration : `.github/workflows/autonomous-delivery.yml`
- Relance opérationnelle : push contrôlé sur `main` après détection d’un événement `agent:ready` non consommé.

## Source de vérité opérationnelle

Ce fichier fournit uniquement le point de départ. Après activation, les issues, labels, Pull Requests, SHA, CI et commentaires CTO signés constituent la source de vérité dynamique.

Une branche `agent/*` ne doit jamais modifier ce fichier ni les autres fichiers de gouvernance protégés.
