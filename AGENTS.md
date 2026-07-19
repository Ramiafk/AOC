# AOS — Instructions permanentes pour les agents de développement

Ce fichier définit la manière obligatoire de travailler sur le dépôt `Ramiafk/AOC`.
Il doit être lu avant toute modification du code.

## 1. Source de vérité

Ordre de priorité :

1. Le Blueprint AOS et les ADR présents dans `docs/adr`.
2. Les décisions CTO publiées sur les pull requests.
3. Les spécifications du lot courant.
4. Le code existant et ses tests.

En cas de contradiction, ne pas improviser. Documenter le conflit dans la PR et demander une décision CTO.

## 2. Règles Git obligatoires

- Ne jamais pousser directement sur `main`.
- Créer une branche dédiée par lot ou correctif.
- Convention de branche : `agent/lot-XX-description` ou `agent/fix-description`.
- Une PR = un objectif cohérent et testable.
- Ouvrir la PR en brouillon tant que le lot n'est pas prêt pour la revue CTO.
- Ne jamais fusionner sans validation CTO explicite.
- Utiliser des commits atomiques avec des messages explicites.

## 3. Livrables requis pour chaque lot

Chaque lot doit inclure :

- code de production ;
- tests unitaires ;
- tests d'intégration lorsque PostgreSQL, sécurité, réseau ou transactions sont concernés ;
- migrations versionnées et immuables si le schéma change ;
- documentation technique ;
- mise à jour des ADR si une décision d'architecture est prise ;
- mise à jour du suivi des lots ;
- description claire des risques, limites et éléments non couverts.

Un lot n'est jamais considéré comme terminé uniquement parce que le code compile.

## 4. Architecture

Principes non négociables :

- modular monolith par défaut ;
- séparation nette entre domaine, application, infrastructure et exposition HTTP ;
- dépendances orientées vers le domaine ;
- pas d'accès direct entre modules métier sans contrat explicite ;
- pas de fichier central regroupant toutes les routes, règles ou schémas ;
- un module métier doit posséder ses propres routes, schémas, services et tests ;
- toute extraction en microservice nécessite une ADR et une justification mesurable.

## 5. Multi-tenant et sécurité

Toute fonctionnalité manipulant des données métier doit appliquer :

- isolation par tenant ;
- contrôle d'accès organisation ;
- contrôle d'accès site lorsque pertinent ;
- résolution préalable du périmètre pour les identifiants opaques ;
- clés étrangères composites `(tenant_id, id)` pour les relations tenant-scoped ;
- RLS PostgreSQL sur les tables concernées ;
- tests négatifs inter-tenant, inter-organisation et inter-site ;
- aucun secret ou identifiant de développement dans le runtime de production ;
- authentification OIDC/JWT en production ;
- audit des opérations critiques.

Une permission globale au tenant n'est pas suffisante dès qu'une ressource appartient à une organisation ou à un site.

## 6. API et validation

- API versionnée sous `/v1` tant qu'aucune autre décision n'est prise.
- Validation systématique des paramètres, requêtes et corps.
- Codes d'erreur métier stables.
- Aucun détail interne sensible dans les réponses 500.
- Les routes doivent déléguer au module métier et rester fines.
- Les ressources opaques doivent être résolues avant autorisation et exécution.

## 7. Base de données

- PostgreSQL est la source persistante de production.
- Les dépôts mémoire sont réservés aux tests et au développement local.
- Toute migration est ordonnée, versionnée et couverte par un test.
- Aucun changement manuel de schéma hors migration.
- Les écritures couplées doivent être transactionnelles.
- Les événements sortants critiques doivent utiliser un outbox transactionnel.
- Les index, contraintes et stratégies de suppression doivent être explicitement justifiés.

## 8. Tests et CI

Avant de demander une revue CTO, exécuter au minimum :

```bash
npm run typecheck
npm test
npm run check
```

La CI GitHub doit être verte sur le commit final de la PR.

Les tests doivent couvrir :

- cas nominal ;
- erreurs métier ;
- accès refusés ;
- isolation multi-tenant ;
- périmètres organisation/site ;
- contraintes PostgreSQL ;
- transactions et rollback ;
- migrations.

Ne jamais présenter des tests comme "réussis" s'ils sont ignorés, simulés ou non exécutés en CI.

## 9. Qualité du code

- Nommage métier précis.
- Pas de duplication évitable.
- Pas de fichier monolithique regroupant plusieurs domaines.
- Pas de dépendance circulaire.
- Pas de `any` ou de cast forcé sans justification.
- Pas de code mort, de TODO silencieux ou de comportement fictif présenté comme terminé.
- Les erreurs doivent être typées et testées.
- Les limites de performance doivent être documentées.

## 10. Format obligatoire des pull requests

Chaque PR doit contenir :

### Objectif
Ce qui est livré et pourquoi.

### Périmètre
Fichiers et modules concernés.

### Décisions techniques
Choix structurants et ADR associées.

### Sécurité
Effets sur tenant, organisation, site, authentification, données sensibles et audit.

### Base de données
Migrations, contraintes, index et compatibilité.

### Validation
Commandes exécutées, nombre de tests et résultat CI.

### Risques et limites
Ce qui reste incomplet, volontairement reporté ou à surveiller.

### Revue CTO
La PR doit rester en brouillon jusqu'à ce que le CTO l'approuve.

## 11. Réponse attendue après chaque tâche

L'agent doit toujours fournir :

- branche utilisée ;
- commits créés ;
- PR créée ou mise à jour ;
- fichiers principaux modifiés ;
- tests exécutés et résultat ;
- statut CI ;
- risques ou limites restants ;
- demande explicite de revue CTO.

## 12. Interdictions absolues

- Fusionner soi-même une PR sans validation CTO.
- Contourner une décision CTO sans ADR approuvée.
- Déclarer un lot terminé sans tests et documentation.
- Utiliser des credentials de développement en production.
- Ajouter une relation inter-tenant non protégée.
- Centraliser plusieurs domaines dans un seul route registry ou service géant.
- Modifier ou supprimer l'historique des migrations déjà publiées.

## 13. Cadence et profondeur minimales de développement

Chaque session de développement demandée doit représenter au minimum **60 minutes de travail technique actif et utile** sur le projet.

- Ne pas arrêter la session dès qu'un sous-lot superficiel compile ou que quelques tests passent.
- Choisir avant de commencer un périmètre suffisamment substantiel pour occuper au moins 60 minutes : implémentation métier, sécurité, persistance, migrations, tests négatifs, documentation et vérification de concurrence lorsque pertinent.
- Si le lot principal est terminé avant 60 minutes, poursuivre sur les éléments directement liés au même objectif : durcissement des invariants, tests supplémentaires, cas limites, observabilité, documentation, performance, qualité et dette technique locale.
- Ne pas ajouter un lot métier sans rapport uniquement pour remplir le temps. Une PR doit rester cohérente et centrée sur un objectif unique.
- Si plusieurs sous-lots sont nécessaires pour atteindre une profondeur suffisante, ils doivent appartenir à la même capacité métier et être explicitement décrits dans la PR.
- À l'issue des 60 minutes, si le lot n'est pas terminé, continuer le développement jusqu'à atteindre la Definition of Done. Le délai de 60 minutes est un minimum de travail, jamais une limite maximale.
- Ne demander la revue CTO qu'une fois le lot réellement terminé, la CI verte et tous les livrables obligatoires présents.
- Le compte rendu doit indiquer l'heure approximative de début, la durée active consacrée, les sous-tâches réalisées et ce qui a nécessité le plus de travail.

Il est interdit de simuler une durée, d'attendre passivement ou d'ajouter du code inutile pour atteindre 60 minutes. La durée doit correspondre à un développement réel, vérifiable dans les commits, les tests et la documentation.

## 14. Definition of Done

Un lot est terminé uniquement lorsque :

- le code est complet ;
- les tests sont présents et verts ;
- la CI est verte ;
- les migrations ont été testées ;
- la sécurité tenant/organisation/site a été vérifiée ;
- la documentation est à jour ;
- les risques restants sont déclarés ;
- le CTO a donné son approbation explicite.
