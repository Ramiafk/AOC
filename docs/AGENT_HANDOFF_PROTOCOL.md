# AOC — Protocole de communication entre agents

## Principes

GitHub est la source de vérité. Les agents communiquent par :

- issues de lots ;
- Pull Requests ;
- checks GitHub Actions ;
- labels ;
- commentaires lisibles et marqueurs machine liés au SHA.

Aucun agent ne doit déduire une approbation depuis une phrase libre.

## Labels

### Contrôle

- `agent:paused` — arrêt global.
- `agent:human-required` — décision externe indispensable.
- `agent:failed` — erreur d’exécution ou boucle arrêtée.

### Exécution

- `agent:dev-working` — développement ou correction en cours.
- `agent:reviewing` — revues spécialisées/CTO en cours.
- `agent:changes-required` — le head actuel est bloqué.
- `agent:approved` — le head actuel est approuvé.

### Lots

- `lot:ready` — issue éligible comme prochain lot.
- `lot:active` — unique lot actif.
- `lot:merged` — lot intégré dans `main`.
- `agent:generated` — issue créée par le planificateur autonome.

## Marqueur d’événement

Tout résultat exploitable porte :

```html
<!-- aoc-agent-event-v1 role=<ROLE> sha=<SHA> status=<STATUS> -->
```

Rôles usuels : `product`, `domain`, `architecture`, `data`, `qa`, `security`, `privacy`, `design`, `accessibility`, `devops`, `documentation`, `developer`, `cto`, `release`, `orchestrator`.

Statuts usuels : `approved`, `changes_required`, `completed`, `blocked`, `advisory`, `ci_failure`.

Un événement n’est valable que pour le SHA exact indiqué.

## Demande développeur

Après un commit et une CI verte, l’agent développeur publie :

```text
<!-- aoc-agent-event-v1 role=developer sha=<SHA> status=completed -->

## Livraison développeur

- Lot : <identifiant>
- Branche : <branche>
- Commit : <SHA>
- CI : <run>
- Tests : <résumé>
- Migrations : <liste ou aucune>
- Documentation : <liste>
- Limites : <liste>

Aucun autre lot n’a été commencé.
```

## Revue spécialisée

Chaque spécialiste publie un résumé, puis un résultat machine. Les constats sont répartis en :

- `blockingFindings` ;
- `recommendations` ;
- `strategicIdeas` ;
- `humanEscalation`.

Un spécialiste ne rend pas l’approbation globale.

## Décision CTO

### Blocage

```text
<!-- aoc-agent-event-v1 role=cto sha=<SHA> status=changes_required -->

Décision CTO : CHANGES REQUIRED
```

Chaque blocage contient :

1. titre ;
2. composant/fichier ;
3. risque ;
4. scénario concret ;
5. correction attendue ;
6. test de non-régression attendu.

### Approbation

```text
<!-- aoc-agent-event-v1 role=cto sha=<SHA> status=approved -->

Décision CTO : APPROVED FOR MERGE
```

L’approbation indique le SHA, la CI et les contrôles validés. Elle devient immédiatement obsolète après un nouveau push.

## Correction automatique

Après `CHANGES REQUIRED` :

1. l’orchestrateur vérifie que la décision vise le head courant ;
2. l’agent développeur relit toutes les conclusions ;
3. il corrige sur la même branche ;
4. il exécute les validations réelles ;
5. il pousse un nouveau commit ;
6. la CI repart ;
7. toutes les revues sont recalculées pour le nouveau SHA.

Aucun lot parallèle n’est autorisé.

## Fusion

Le release manager ne peut fusionner que si :

- la PR est interne au dépôt ;
- le SHA approuvé égale le head courant ;
- tous les checks requis sont verts ;
- aucune revue spécialisée bloquante n’est ouverte ;
- aucune pause ou escalade n’est active ;
- GitHub autorise la fusion.

Après fusion :

- la branche est supprimée ;
- l’issue est fermée ;
- le lot reçoit `lot:merged` ;
- un seul lot `lot:ready` peut devenir `lot:active`.

## Commandes de contrôle humain

Même en mode autonome, les opérateurs peuvent utiliser :

- label `agent:paused` — arrêter ;
- retrait du label — autoriser la reprise ;
- label `agent:human-required` — conserver le blocage ;
- lancement manuel du workflow **AOC Autonomous Multi-Agent Loop** — exécuter immédiatement un cycle ;
- fermeture d’une issue `lot:ready` — retirer le lot de la file ;
- commentaire explicite dans une escalade — fournir la décision manquante.

Aucun commentaire humain ne contourne automatiquement la CI ou la revue CTO. Une modification de politique doit passer par une PR de gouvernance.
