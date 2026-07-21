# AOC — Système autonome multi-agents

## Objectif

Ce système transforme GitHub en chaîne de production autonome pour AOC. Il coordonne la conception produit, le développement, le graphisme/UX, les tests, la sécurité, PostgreSQL, l’architecture, la documentation, la revue CTO et la fusion.

AOC reste un SaaS multi-métiers et multi-véhicules : automobile, moto, quad, bateau et autres véhicules ; garages, vendeurs, ateliers, carrossiers, préparateurs, inspecteurs, transporteurs, fournisseurs, financeurs et autres prestataires. Il comprend la plateforme centrale ainsi que les sites et applications propres aux professionnels et à leurs clients.

## Organisation des agents

Le fichier `.agents/roles.json` décrit l’équipe :

- **Orchestrateur** : lit l’état GitHub et déclenche la prochaine action autorisée.
- **CPO / Product** : définit la valeur, le périmètre et les critères d’acceptation.
- **Responsable domaine véhicule** : protège les règles multi-véhicules et multi-professionnels.
- **Architecte** : contrôle les modules, contrats, transactions et canaux.
- **Développeurs backend, web et mobile** : implémentent le lot actif.
- **UX/UI et graphiste** : produit les parcours, design tokens, composants, écrans et ressources SVG ; il contrôle les états responsive, vides, d’erreur et de permissions.
- **Accessibilité** : contrôle clavier, sémantique, focus, contrastes et technologies d’assistance.
- **Data/PostgreSQL** : contrôle les migrations, RLS, FK composites, index et upgrades peuplés.
- **QA** : contrôle les tests métier, API, PostgreSQL, migration, concurrence et rollback.
- **Sécurité** : contrôle autorisations, IDOR, secrets, fichiers, webhooks, paiements et supply chain.
- **Vie privée / conformité** : contrôle minimisation, consentement, rétention, suppression et auditabilité ; les ambiguïtés juridiques sont escaladées, jamais inventées.
- **DevOps/SRE** : contrôle CI, permissions, observabilité, sauvegardes, déploiement et rollback.
- **Rédacteur technique** : maintient la documentation produit, API et exploitation.
- **CTO** : agrège les preuves et rend `APPROVED FOR MERGE` ou `CHANGES REQUIRED` pour le SHA courant.
- **Release manager** : fusionne uniquement le SHA approuvé avec CI verte, puis active le lot suivant.

Les agents de revue sont en lecture seule. L’agent développeur ne peut pas s’approuver. Le CTO ne peut pas modifier le code ni fusionner. La séparation est imposée par la politique et doit idéalement être renforcée par des GitHub Apps distinctes.

## Machine d’états

Le seul parcours normal est :

```text
BACKLOG
  → ACTIVE_LOT
  → DEVELOPMENT
  → DRAFT_PR
  → CI
  → SPECIALIST_REVIEW
  → CTO_REVIEW
  → FIXES ou APPROVED
  → MERGE
  → NEXT_LOT
```

Contraintes :

- un seul lot actif ;
- une seule branche `agent/*` active ;
- une seule PR produit active ;
- aucune branche empilée ;
- aucune fusion sans décision CTO pour le head SHA actuel ;
- toute modification du head rend les anciennes validations caduques.

## Déclenchement

`.github/workflows/aoc-autonomous-loop.yml` s’exécute :

- toutes les **10 minutes** ;
- à la fin du workflow `CI` ;
- après un push dans `main` ;
- après une modification d’issue de lot ;
- manuellement via `workflow_dispatch`.

La concurrence GitHub Actions empêche deux orchestrateurs de travailler simultanément.

## Cycle d’une PR

1. L’orchestrateur détecte la seule PR `agent/*` ouverte.
2. Il vérifie que la PR ne vient pas d’un fork.
3. Il attend la CI du head SHA.
4. Il calcule les spécialistes obligatoires à partir des chemins modifiés.
5. Chaque spécialiste inspecte le code réel et publie un résultat lié au SHA.
6. Le CTO relit le diff et les constats, puis publie la décision finale.
7. En cas de `CHANGES REQUIRED`, l’agent développeur corrige sur la même branche, exécute les validations, pousse un nouveau commit et attend la nouvelle CI.
8. Après approbation du SHA courant et CI verte, le release manager effectue une fusion squash.
9. Le lot lié est fermé ; un seul lot suivant est activé.

Les commentaires contiennent un marqueur machine :

```html
<!-- aoc-agent-event-v1 role=cto sha=<SHA> status=approved -->
```

Un commentaire sans marqueur ou portant un ancien SHA n’accorde aucun droit de fusion.

## Création autonome du lot suivant

La priorité est donnée aux issues ouvertes portant le label `lot:ready`.

Lorsqu’aucune issue prête n’existe et que `AOC_AUTO_CREATE_LOTS=true`, le CPO et le responsable domaine proposent **un seul lot borné** à partir de :

- la vision produit ;
- la roadmap ;
- les lots fusionnés ;
- les limites déclarées dans les PR ;
- les recommandations non bloquantes et idées stratégiques déjà enregistrées.

L’orchestrateur crée l’issue, puis s’arrête. Le développement commence au cycle suivant, ce qui laisse une trace GitHub avant toute écriture de code.

## Runtime des agents

`scripts/agents/runtime.mjs` fournit au modèle des outils contrôlés :

- lister les fichiers suivis par Git ;
- lire une plage de lignes ;
- rechercher une chaîne ;
- lire le diff ;
- lire le statut Git ;
- exécuter seulement les commandes de validation autorisées ;
- pour les rôles d’implémentation seulement, écrire un fichier ou appliquer un patch.

Il n’expose pas de shell arbitraire au modèle. Les commandes sont définies dans `.agents/policy.json`. Les chemins protégés ne sont modifiables que par un lot de gouvernance explicite.

Les réponses doivent terminer par un JSON validable entre les marqueurs définis dans `.agents/prompts/common.md`. Une réponse sans résultat machine arrête le rôle au lieu de deviner.

## Configuration unique indispensable

GitHub ne peut ni inventer ni enregistrer lui-même un secret. Une personne ayant les droits administrateur doit effectuer une fois la configuration suivante dans :

**Settings → Secrets and variables → Actions**

### Secrets

```text
AOC_AGENT_API_KEY
AOC_AUTONOMY_GITHUB_TOKEN
```

`AOC_AGENT_API_KEY` donne accès au moteur d’agents configuré.

`AOC_AUTONOMY_GITHUB_TOKEN` est fortement recommandé. Il doit provenir d’une GitHub App dédiée, avec les permissions minimales nécessaires sur le seul dépôt AOC :

- Contents : read/write ;
- Pull requests : read/write ;
- Issues : read/write ;
- Actions et Checks : read.

Un jeton séparé permet aux pushes de l’agent de déclencher normalement la CI. Le `GITHUB_TOKEN` standard peut empêcher les workflows en cascade.

### Variables

```text
AOC_AUTONOMY_ENABLED=true
AOC_AGENT_MODEL=<modèle autorisé>
AOC_AUTOMERGE_ENABLED=true
AOC_AUTO_CREATE_LOTS=true
AOC_AGENT_MAX_TOOL_CALLS=60
AOC_INCLUDE_AGENT_TRANSCRIPT=false
```

Variable facultative pour un endpoint compatible différent :

```text
AOC_AGENT_ENDPOINT=https://api.openai.com/v1/responses
```

Les clés ne doivent jamais être collées dans une issue, une PR, un fichier ou une conversation.

## Paramètres GitHub recommandés

Sur `main` :

- interdire le push direct ;
- exiger les checks `CI` et `AOC Agent System Check` ;
- exiger une branche à jour avant fusion si le dépôt le nécessite ;
- autoriser le squash merge ;
- activer l’auto-merge ;
- supprimer automatiquement les branches fusionnées ;
- interdire le force-push ;
- limiter les modifications des workflows et de `.agents/` à des lots de gouvernance.

Pour une séparation cryptographiquement plus forte, utiliser trois GitHub Apps : développeur, CTO et release. Le système fonctionne avec une seule App, mais l’indépendance des identités est alors une convention auditée plutôt qu’une barrière GitHub complète.

## Arrêt, pause et reprise

Créer ou appliquer le label `agent:paused` pour arrêter toutes les actions autonomes.

L’orchestrateur s’arrête aussi et applique `agent:human-required` en cas de :

- plusieurs PR produit actives ;
- ambiguïté juridique ou réglementaire ;
- risque irréversible sur des données de production ;
- contrat de paiement non défini ;
- boucles de correction dépassant la limite ;
- secrets ou configuration manquants ;
- refus de fusion par les règles GitHub.

L’escalade n’autorise pas les agents à contourner le problème. Elle produit une issue ou un commentaire précis avec les preuves disponibles.

## Graphisme et médias

Le graphiste autonome peut produire dans le dépôt :

- architecture de navigation ;
- parcours et wireframes documentés ;
- design tokens ;
- composants web/mobile ;
- icônes et illustrations SVG ;
- spécifications de photos et vidéos ;
- revues visuelles basées sur captures générées par les tests.

La génération de ressources raster ou de campagnes créatives peut être branchée sur un endpoint d’image distinct. Elle ne doit jamais utiliser de personnes réelles, de marques ou de contenus protégés sans droits vérifiés. Les médias produits doivent être optimisés, attribués et validés par les tests de build.

## Limites honnêtes de l’autonomie

Après la configuration des secrets, le cycle GitHub peut fonctionner sans intervention pour les lots ordinaires. Certaines décisions doivent néanmoins arrêter la chaîne plutôt que d’être inventées : obligations légales, contrats de paiement, accès à des systèmes de production externes, achats de services, choix irréversibles ou traitements de données sensibles non documentés.

Cette pause est un garde-fou de qualité, pas une panne du système.
