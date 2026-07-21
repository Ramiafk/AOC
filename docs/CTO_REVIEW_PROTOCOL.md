# AOC — Protocole de revue CTO autonome

## Demande de revue

Le développement publie dans la PR : lot et issue, branche, head SHA, résultat local, migrations, risques, hors-périmètre et marqueur `[AOC-DEV][sha:<SHA>]`.

## Vérifications spécialisées

Selon les fichiers et le lot, l’orchestrateur convoque sécurité, finance/fraude, conformité, accessibilité/performance et les autres reviewers requis. Ces rôles sont en lecture seule.

## Décision CTO

Le CTO vérifie le SHA, la CI, le diff, les règles métier, les migrations peuplées, PostgreSQL, la concurrence, la sécurité, les tests, la documentation et les rapports spécialisés.

Décisions possibles :

```text
[AOC-CTO][sha:<SHA>][decision:APPROVED_FOR_MERGE]
[AOC-CTO][sha:<SHA>][decision:CHANGES_REQUIRED]
```

Chaque blocage précise le risque, le scénario, la correction et le test attendu.

## Correction

`CHANGES_REQUIRED` déclenche une correction sur la même branche. Le nouveau SHA invalide automatiquement l’ancienne décision. La PR reste en brouillon jusqu’à une nouvelle CI verte et une nouvelle approbation.

## Fusion

Le release manager automatique fusionne uniquement si la CI et l’approbation correspondent exactement au head SHA. Aucun lot suivant ne démarre avant la fusion effective.
