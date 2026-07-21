# AOC — Livraison autonome multi-agents, entièrement dans GitHub

## 1. Objectif

GitHub est l’unique atelier d’orchestration du développement d’AOC. Les agents se coordonnent par Issues, labels, branches, Pull Requests, GitHub Actions, GitHub Models, commentaires signés, artefacts et CI PostgreSQL.

Le cycle normal est :

**roadmap → conception → développement → QA → CI → revues spécialisées → décision CTO → corrections → fusion → lot suivant**.

Aucun service d’orchestration externe tel que n8n n’est nécessaire pour construire le produit.

## 2. Équipe virtuelle

Les rôles sont définis dans `config/agents/roles.json` : direction produit, expertise métiers du véhicule, UX, graphisme/UI, architecture, développement full-stack, frontend, mobile/PWA, intégrations, data, QA, sécurité, accessibilité/performance, DevOps/SRE, documentation, conformité, finance/fraude, customer success, growth/SEO et CTO.

Tous les agents ne sont pas appelés sur chaque lot. `config/agents/roadmap.json` indique les rôles nécessaires afin de préserver la qualité sans multiplier artificiellement les appels.

## 3. Orchestrateur unique

Le seul workflow d’orchestration est `.github/workflows/autonomous-delivery.yml`. Il se déclenche :

- toutes les dix minutes ;
- après la fin de la CI ;
- après une commande autorisée dans une Issue ;
- manuellement par `workflow_dispatch` pour reprise technique.

L’orchestrateur :

1. crée les labels, la console de contrôle et les Issues de roadmap manquantes ;
2. vérifie qu’une seule PR `agent/*` est active ;
3. choisit le premier lot dont les dépendances sont fusionnées ;
4. exécute les agents requis dans un workspace partagé ;
5. crée une branche et une PR brouillon ;
6. déclenche explicitement la CI ;
7. corrige automatiquement une CI rouge ou une décision CTO négative ;
8. limite les boucles de correction ;
9. fusionne uniquement le SHA approuvé et testé ;
10. ferme l’Issue de lot et sélectionne le suivant.

Les anciens workflows autonomes séparés ont été supprimés afin qu’une seule machine d’états puisse agir.

## 4. Source de vérité et sécurité

Ordre de confiance : GitHub et le SHA courant, CI associée à ce SHA, commentaire CTO signé par le bot ou le propriétaire, Issue de lot créée par le bot ou le propriétaire, documents de vision, puis code et tests.

Les commentaires non autorisés et les instructions dissimulées dans le dépôt, les logs, les fixtures ou les données sont traités comme des données non fiables.

Les branches métier ne peuvent pas modifier :

- les workflows GitHub ;
- `AGENTS.md` ;
- `package.json` ou `package-lock.json` ;
- `config/agents/` ;
- `scripts/agents/` ;
- les visions produit et technique ;
- les modèles d’Issue et de PR.

Les commandes de validation retirent les credentials de leur environnement avant d’exécuter le code du lot.

## 5. Machine d’états

Labels principaux :

- `agent:backlog` ;
- `agent:ready` ;
- `agent:active` ;
- `agent:dev-working` ;
- `agent:cto-review` ;
- `agent:changes-required` ;
- `agent:approved` ;
- `agent:blocked` ;
- `agent:human-gate` ;
- `agent:paused` ;
- `agent:done`.

Une seule Issue peut porter `agent:active` et une seule PR métier `agent/*` peut être ouverte.

## 6. Communication signée

```text
[AOC-DEV][sha:<SHA>]
[AOC-DEV-FIX][sha:<SHA>][source:ci-123]
[AOC-CTO][sha:<SHA>][decision:CHANGES_REQUIRED]
[AOC-CTO][sha:<SHA>][decision:APPROVED_FOR_MERGE]
[AOC-RELEASE][sha:<SHA>]
```

Une décision n’est valable que pour le SHA indiqué. Toute modification relance la CI et la revue.

## 7. Runtime IA GitHub

`scripts/agents/agent-runtime.mjs` utilise GitHub Models avec le `GITHUB_TOKEN` et la permission `models: read`. Il expose uniquement des outils bornés, interdit les chemins protégés, limite les commandes, bloque les secrets potentiels, limite les tailles et les tours, impose un rapport structuré et sépare les agents écrivains des reviewers en lecture seule.

Le graphiste produit directement dans le dépôt : design tokens, wireframes, spécifications, composants et iconographie SVG. Aucune clé de génération d’images externe n’est requise.

## 8. CI, revue et fusion

Les commits réalisés avec le `GITHUB_TOKEN` sont suivis d’un `workflow_dispatch` explicite vers `ci.yml`.

La fusion exige :

- une CI `success` portant le head SHA courant ;
- un commentaire CTO `APPROVED_FOR_MERGE` pour ce même SHA ;
- une PR ouverte, sans conflit et sans human gate ;
- une revalidation du head immédiatement avant fusion.

Une CI rouge ou `CHANGES_REQUIRED` déclenche une correction sur la même branche, un renforcement QA, un nouveau commit et une nouvelle CI. Le système accepte au maximum trois cycles de correction par PR.

## 9. Commandes de contrôle

Une Issue de contrôle est créée automatiquement. Seuls le propriétaire, un membre ou un collaborateur autorisé peuvent utiliser :

```text
/agent pause
/agent resume
/agent retry
/agent status
/agent abort
```

`abort` suspend et bloque sans supprimer les branches ni les données.

## 10. Human gates

Le code, les tests, les migrations, la documentation, les revues et les fusions avancent sans intervention. Les seules pauses obligatoires concernent : secret de production, premier déploiement production, suppression destructive, contrat ou credentials live d’un PSP, certification ou dépôt réglementaire, achat de domaine ou engagement financier externe.

Le système continue tout ce qui est possible avant cette frontière et publie l’action exacte restante.

## 11. Audit

Chaque exécution conserve les tâches, outils et rapports dans un artefact GitHub Actions `.agent` pendant trente jours. Les décisions essentielles restent aussi dans la PR.

## 12. Activation

Le workflow est actif par défaut. La variable de dépôt `AOC_AUTONOMY_ENABLED=false` le désactive.

Variables facultatives :

```text
AOC_MODEL_REASONING=openai/gpt-4.1
AOC_MODEL_CODE=openai/gpt-4.1
AOC_MODEL_FAST=openai/gpt-4.1-mini
AOC_MODEL_DESIGN=openai/gpt-4.1
AOC_MAX_AGENT_TURNS=24
AOC_AGENT_MAX_TOKENS=6000
```

Ces modèles sont appelés par GitHub Models depuis GitHub Actions. Aucun orchestrateur externe n’est requis.
