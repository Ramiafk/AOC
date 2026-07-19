# ADR-0002 — Tenant explicite et isolation par défaut

**Statut : accepté — 2026-07-19**

Toute commande, requête, entité et événement métier porte un `tenantId`. L'API ne l'accepte jamais du corps envoyé par le client : il provient de l'identité authentifiée. PostgreSQL applique en plus une politique RLS. Les opérations inter-organisations utilisent un contexte réseau explicite, une autorisation et une trace d'audit.
