# AOC — Livraison autonome multi-agents

## 1. Objectif

Ce dispositif transforme GitHub en atelier autonome de livraison. Les agents se coordonnent par issues, labels, PR, CI et commentaires signés. Le responsable du produit n’a plus à transmettre manuellement les messages entre le développement et le CTO.

Le cycle normal est :

**roadmap → conception → développement → QA → CI → revues spécialisées → décision CTO → corrections → fusion → lot suivant**.

## 2. Équipe virtuelle

Les rôles sont définis dans `config/agents/roles.json` : direction produit, expertise métiers du véhicule, UX, graphisme/UI, architecture, développement full-stack, frontend, mobile/PWA, intégrations, data, QA, sécurité, accessibilité/performance, DevOps/SRE, documentation, conformité, finance/fraude, customer success, growth/SEO et CTO.

Tous les agents ne sont pas appelés sur chaque lot. La roadmap indique les rôles nécessaires afin de garder un périmètre cohérent et un coût maîtrisé.

## 3. Orchestrateur

Le workflow `.github/workflows/autonomous-delivery.yml` se déclenche toutes les dix minutes, après la fin de la CI, après une commande autorisée dans une issue ou manuellement.

L’orchestrateur :

1. crée les labels et les issues de roadmap manquants ;
2. vérifie qu’une seule PR `agent/*` est active ;
3. choisit le premier lot dont les dépendances sont fusionnées ;
4. exécute les agents requis dans un workspace unique ;
5. crée une branche et une PR brouillon ;
6. déclenche explicitement la CI ;
7. corrige automatiquement une CI rouge ou une décision CTO négative ;
8. limite les boucles de correction ;
9. fusionne seulement le SHA approuvé et testé ;
10. ferme l’issue de lot et sélectionne le suivant.

## 4. Source de vérité et sécurité

Ordre de confiance : GitHub et le SHA courant, CI associée à ce SHA, commentaire CTO signé par le bot ou le propriétaire, issue de lot créée par le bot ou le propriétaire, documents de vision, puis code et tests.

Les commentaires d’utilisateurs non autorisés et le texte trouvé dans le dépôt sont traités comme des données non fiables. Ils ne peuvent pas donner d’ordre au système.

Les agents écrivains ne peuvent pas modifier leur propre runtime, `AGENTS.md`, la politique, la roadmap autonome ou le workflow principal.

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

Une seule issue peut porter `agent:active` et une seule PR métier `agent/*` peut être ouverte.

## 6. Communication signée

```text
[AOC-DEV][sha:<SHA>]
[AOC-DEV-FIX][sha:<SHA>][source:ci-123]
[AOC-CTO][sha:<SHA>][decision:CHANGES_REQUIRED]
[AOC-CTO][sha:<SHA>][decision:APPROVED_FOR_MERGE]
[AOC-RELEASE][sha:<SHA>]
```

Une décision n’est valable que pour le SHA indiqué. Toute modification relance la CI et la revue.

## 7. Runtime IA

Le runtime `scripts/agents/agent-runtime.mjs` utilise GitHub Models avec le `GITHUB_TOKEN`, expose uniquement des outils bornés, interdit les commandes arbitraires, refuse les chemins protégés, bloque les secrets potentiels, limite tailles et tours, impose un rapport structuré et sépare les agents écrivains des reviewers en lecture seule.

Par défaut, aucune clé OpenAI séparée n’est requise pour le texte. Une clé `OPENAI_API_KEY` reste optionnelle pour générer des images raster ; le graphiste peut toujours produire des SVG, design tokens, wireframes et spécifications sans cette clé.

## 8. CI, revue et fusion

Les commits réalisés avec le `GITHUB_TOKEN` sont suivis d’un `workflow_dispatch` explicite vers `ci.yml`.

La fusion exige : CI `success`, run portant le head SHA courant, commentaire CTO `APPROVED_FOR_MERGE` pour ce même SHA, PR ouverte sans conflit et aucune human gate.

Une CI rouge ou `CHANGES_REQUIRED` déclenche une correction sur la même branche, un renforcement QA, un nouveau commit et une nouvelle CI. Le système accepte au maximum trois cycles de correction par PR.

## 9. Commandes de contrôle

Une issue de contrôle est créée automatiquement. Seuls le propriétaire, un membre ou un collaborateur autorisé peuvent utiliser :

```text
/agent pause
/agent resume
/agent retry
/agent status
/agent abort
```

`abort` suspend et bloque sans supprimer les branches ni les données.

## 10. Human gates

Le code, les tests, les migrations, la documentation et les PR avancent sans intervention. Les seules pauses obligatoires concernent : secret de production, premier déploiement, suppression destructive, contrat ou credentials live d’un PSP, certification ou dépôt réglementaire, achat de domaine ou engagement financier externe.

Le système continue tout ce qui est possible avant cette frontière et publie l’action exacte restante.

## 11. Audit

Chaque exécution conserve tâches et rapports dans un artefact GitHub Actions `.agent` pendant trente jours. Les décisions essentielles restent aussi dans la PR.

## 12. Activation

Le workflow est actif par défaut. La variable `AOC_AUTONOMY_ENABLED=false` le désactive.

Variables facultatives :

```text
AOC_MODEL_REASONING=openai/gpt-4.1
AOC_MODEL_CODE=openai/gpt-4.1
AOC_MODEL_FAST=openai/gpt-4.1-mini
AOC_MODEL_DESIGN=openai/gpt-4.1
AOC_MAX_AGENT_TURNS=24
```
