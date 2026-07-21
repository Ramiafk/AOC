# Correction du budget de contexte des agents

Le lot 5J a revele des erreurs GitHub Models 413 sur le modele gpt-4.1, dont la limite d'entree est de 8000 tokens dans l'environnement utilise.

La politique borne desormais plus strictement :

- les taches d'agent a 3000 caracteres ;
- chaque sortie d'outil a 1200 caracteres ;
- la requete complete a 14000 caracteres ;
- la conversation conserve un seul round historique.

Un self-test CI empeche la regression de ces limites.
