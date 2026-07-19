# ADR-0001 — Modular monolith avant services distribués

**Statut : accepté — 2026-07-19**

Le Core démarre dans un seul déploiement, découpé en modules métier avec dépendances contrôlées. Chaque module possède son domaine, ses cas d'usage et ses ports. Les communications asynchrones utilisent un outbox transactionnel. Cette forme réduit le coût du démarrage tout en conservant une voie d'extraction ultérieure. Aucun module ne lit directement les tables internes d'un autre module.
