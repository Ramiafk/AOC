# Workflow autonome AOS — Développeur ↔ CTO

## But

Ce dispositif permet au dépôt `Ramiafk/AOC` d’enchaîner les lots sans intervention quotidienne : sélection du prochain lot, développement, validations PostgreSQL, revue CTO indépendante, corrections, fusion exacte du SHA approuvé, puis démarrage du lot suivant.

GitHub reste la source de vérité. Les agents communiquent dans les issues, statuts de commit et commentaires de Pull Request.

## Agents

### Agent développeur

Le workflow `AOS Autonomous Developer` :

- prend le prochain lot de `config/agents/backlog.json` ;
- crée une branche `agent/lot-*` ;
- utilise Codex si `OPENAI_API_KEY` existe ;
- utilise sinon GitHub Models avec le `GITHUB_TOKEN`, sans secret supplémentaire ;
- modifie uniquement les fichiers produit autorisés ;
- exécute typecheck, tests PostgreSQL 17 et contrôle d’architecture ;
- crée ou met à jour une PR brouillon ;
- publie le statut `autonomy/ci` sur le SHA exact ;
- déclenche le CTO.

### Agent CTO

Le workflow `AOS Autonomous CTO` :

- vérifie le SHA, la PR et le statut CI exacts ;
- interdit toute modification des fichiers de gouvernance depuis une branche de lot ;
- inspecte le domaine, les routes, PostgreSQL, les migrations, la sécurité, la concurrence, l’outbox, les tests et la documentation ;
- publie `CHANGES_REQUIRED` ou `APPROVED_FOR_MERGE` ;
- publie le statut `autonomy/cto` sur le SHA examiné ;
- redéclenche les corrections ou fusionne le SHA approuvé ;
- ne lance le lot suivant qu’après fusion effective.

## Séparation des pouvoirs

- l’agent développeur ne peut pas écrire dans les workflows, prompts, scripts d’orchestration ni `AGENTS.md` ;
- le CTO travaille en lecture seule ;
- la fusion revalide le head SHA immédiatement avant l’appel GitHub ;
- toute modification après approbation invalide la décision ;
- le contrôle `pull_request_target` lit uniquement les métadonnées GitHub et ne checkout jamais le code non fiable ;
- quatre boucles de corrections CTO maximum sont autorisées avant arrêt de sécurité.

## États GitHub

- `autonomy/ci = success` : validations indépendantes vertes sur ce SHA ;
- `autonomy/cto = failure` : corrections obligatoires ;
- `autonomy/cto = success` : SHA approuvé et fusion autorisée.

Les commentaires contiennent des marqueurs machine :

- `AOS_AUTONOMY_DEV` ;
- `AOS_AUTONOMY_CTO` ;
- `AOS_AUTONOMY_BLOCKED`.

## Reprise automatique

Le watchdog s’exécute toutes les dix minutes :

- sans PR active, il relance la sélection du prochain lot ;
- avec CI verte sans revue, il relance le CTO ;
- avec décision de correction, il relance le développeur ;
- avec approbation mais PR encore ouverte, il revalide la fusion.

## Fournisseur d’IA

Ordre de sélection :

1. `openai/codex-action@v1` si le secret `OPENAI_API_KEY` est présent ;
2. agent de secours interne fondé sur GitHub Models et la permission `models: read`.

Variables facultatives :

- `AOS_CODEX_MODEL` ;
- `AOS_CTO_MODEL` ;
- `AOS_GITHUB_MODEL` ;
- `AOS_GITHUB_CTO_MODEL` ;
- `AOS_AUTONOMY_PAUSED=true` pour suspendre immédiatement les nouveaux travaux.

Aucune clé bancaire, donnée de carte ou credential produit n’est transmis aux modèles.

## Backlog autonome actuel

Le premier train autonome couvre les lots :

- 5J — cycles d’enchères de 24 h, trois relances et bascule achat immédiat ;
- 5K — réserve, achat immédiat et décision du propriétaire ;
- 5L — marketplace professionnelle et publique ;
- 5M — inspection et fiche véhicule complète ;
- 5N — notifications, enchères automatiques et anti-sniping.

Une fois ces lots fusionnés, le workflow crée une issue de fin de backlog et s’arrête proprement.

## Arrêt d’urgence

Définir la variable de dépôt `AOS_AUTONOMY_PAUSED` à `true`. Les workflows déjà en cours termineront leur étape courante, mais aucun nouveau lot ni nouvelle reprise ne sera lancé.
