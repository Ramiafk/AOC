# Workflow autonome AOC — document de transition

La première boucle Développeur ↔ CTO issue de la PR #15 a été consolidée dans l’organisation multi-agents.

La documentation canonique est désormais :

- `docs/AUTONOMOUS_DELIVERY.md` ;
- `docs/PRODUCT_VISION.md` ;
- `docs/TECHNICAL_VISION.md` ;
- `docs/CTO_REVIEW_PROTOCOL.md` ;
- `config/agents/policy.json` ;
- `config/agents/roles.json` ;
- `config/agents/roadmap.json`.

Le seul orchestrateur actif est `.github/workflows/autonomous-delivery.yml`. Les anciens workflows séparés ne doivent plus être réactivés afin d’éviter deux agents travaillant simultanément sur le même lot.
