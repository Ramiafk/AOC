# Incident autonomie GitHub — 21 juillet 2026

## Résumé

La première exécution réelle du lot 5J a révélé deux défauts de l’orchestration autonome :

1. plusieurs exécutions historiques ont créé des issues de roadmap et de contrôle en double ;
2. le premier agent de planification a dépassé la limite de requête de GitHub Models et a reçu une erreur HTTP 413.

L’automatisation a été suspendue via l’issue de contrôle canonique pendant la correction. Aucun code métier du lot 5J n’a été fusionné et aucune donnée de production n’a été touchée.

## Cause des issues dupliquées

Des exécutions déjà mises en file avant les hotfixes de concurrence ont chacune tenté d’initialiser la roadmap. Les marqueurs étaient idempotents dans une exécution isolée, mais plusieurs générations de workflow ont pu se chevaucher.

## Cause de l’erreur GitHub Models

Le runtime bornait la réponse du modèle et compactait les anciens tours, mais conservait encore :

- une tâche initiale trop longue ;
- les schémas d’outils ;
- des sorties d’outils volumineuses ;
- un budget de réponse trop élevé pour la limite totale du modèle utilisé.

La somme dépassait la limite de 8 000 tokens signalée par GitHub Models.

## Corrections

### Registre canonique des issues

`scripts/agents/reconcile-issues.mjs` :

- regroupe les issues par marqueur de contrôle ou identifiant de lot ;
- conserve l’issue la plus ancienne comme source de vérité ;
- neutralise le marqueur machine des doublons avant fermeture ;
- retire leurs labels d’état ;
- les ferme comme doublons sans les faire passer pour des lots terminés ;
- s’exécute avant chaque passage de l’orchestrateur.

La neutralisation du marqueur est indispensable : une issue dupliquée fermée ne doit jamais satisfaire artificiellement une dépendance de roadmap.

### Budget strict GitHub Models

`scripts/agents/github-models-budget.mjs` est chargé par `NODE_OPTIONS` uniquement pendant l’étape d’orchestration. Il :

- limite le corps JSON envoyé à GitHub Models ;
- réduit la tâche initiale ;
- conserve au plus le nombre de tours autorisé par la politique ;
- réduit les descriptions d’outils sans supprimer leurs identifiants ni leurs schémas ;
- borne les tokens de réponse ;
- applique plusieurs niveaux de compression ;
- refuse explicitement une requête qui ne peut toujours pas respecter le budget.

Aucun contenu de requête, secret ou sortie métier n’est écrit dans les journaux du garde-budget ; seuls les volumes avant/après sont journalisés.

### Validation

La CI exécute désormais :

- la vérification syntaxique des deux nouveaux scripts ;
- un test autonome du budget de requête ;
- un test autonome du plan de réconciliation ;
- la validation de gouvernance ;
- le typage, les tests PostgreSQL et le contrôle d’architecture existants.

## Reprise contrôlée

1. fusionner le hotfix après CI verte ;
2. laisser le workflow nettoyer les doublons alors que l’issue de contrôle reste en pause ;
3. vérifier qu’il ne reste qu’une issue canonique par lot et une issue de contrôle ;
4. retirer `agent:paused` de l’issue de contrôle canonique ;
5. observer le lot 5J jusqu’à la création de sa PR brouillon ;
6. ne démarrer aucun autre lot avant la décision CTO et la fusion de 5J.

## Décision d’architecture

AOC reste entièrement orchestré dans GitHub : GitHub Actions, GitHub Models, Issues, Pull Requests, labels et CI PostgreSQL. Aucun n8n, orchestrateur externe ni clé de modèle séparée n’est requis pour cette boucle de développement.
