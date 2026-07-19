# ADR-0004 — Une configuration unique pour le web et le mobile clients

**Statut : accepté — 2026-07-19**

Les sites professionnels, applications client et espaces client web partagent une configuration de marque versionnée. Elle contient les design tokens, les activités, les surfaces activées, le parcours principal, les coordonnées et l'ordre des modules d'accueil.

Les surfaces n'utilisent jamais le nom ou les couleurs d'un pilote dans leur code. Elles rendent la configuration du tenant. Les activités déterminent les modules recommandés : stock pour le commerce, prestations pour les métiers de service et gestion de flotte pour la location/flotte. Les composants sont partagés, mais chaque surface conserve une composition adaptée au web ou au mobile.
