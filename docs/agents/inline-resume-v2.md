# Reprise inline des commandes d’autonomie

Cette correction remplace le second `workflow_dispatch` par une poursuite dans le même job GitHub Actions. Les commandes de reprise restent authentifiées, nettoient la console et l’orchestrateur reçoit un contexte neutralisé afin de poursuivre immédiatement sans retraiter le commentaire comme une commande.
