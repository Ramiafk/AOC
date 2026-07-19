# ADR-0003 — Deux applications centrales et des canaux marque blanche

**Statut : accepté — 2026-07-19**

Le produit possède deux applications centrales distinctes :

- une application grand public de réservation multi-prestations, comparable dans son principe à Booking ou Doctolib ;
- une application de gestion destinée aux professionnels, à leurs équipes et aux clients accédant à leur espace.

Chaque professionnel peut en plus disposer d'une application client et d'un site internet à sa marque. Leur navigation, catalogue, formulaires, fonctionnalités et règles dépendent des activités activées pour l'organisation.

Toutes les surfaces consomment les mêmes API versionnées, mais possèdent des autorisations, une identité visuelle et des parcours séparés. Le canal d'acquisition est enregistré sur chaque demande et réservation. Les clients apportés directement par un professionnel ne deviennent pas automatiquement des clients commerciaux de la plateforme centrale.
