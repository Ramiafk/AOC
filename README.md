# AOS — Mobility Services Operating System

Socle générique et multi-tenant d'une plateforme de services de mobilité. BEL AUTO 72 est le premier pilote, jamais une dépendance de l'architecture.

## Principes non négociables

- voitures, motos, scooters, quads, bateaux, jet-skis, camping-cars, caravanes, utilitaires et poids lourds sont des configurations d'un même modèle d'actif ;
- un professionnel peut exercer plusieurs métiers et exploiter plusieurs établissements ;
- plateforme centrale, back-office, sites et applications en marque blanche utilisent le même Core via des API versionnées ;
- les données sont isolées par tenant, les permissions sont vérifiées côté serveur et les actions critiques sont auditées ;
- les intégrations externes passent par des ports/connecteurs remplaçables ;
- le produit démarre en modular monolith et ne sera découpé en services qu'à partir de preuves de charge ou d'autonomie d'équipe.

## Surfaces produit

Le même Core alimente trois familles de surfaces distinctes :

1. **Application centrale de réservation** : expérience grand public de type Booking/Doctolib pour rechercher, comparer et réserver n'importe quelle prestation auprès de tous les professionnels éligibles.
2. **Application de gestion** : outil métier des professionnels et de leurs équipes, comprenant aussi l'espace où leurs propres clients retrouvent rendez-vous, devis, factures, documents, messages et passeports de mobilité.
3. **Canaux marque blanche du professionnel** : site internet et application client propres à chaque entreprise, configurés selon ses activités, sa marque, ses services et ses règles commerciales.

Ces surfaces restent séparées dans leur identité et leurs parcours. Elles partagent uniquement les données autorisées du Core. La plateforme centrale ne doit pas détourner les clients acquis directement par un professionnel via son site ou son application.

## Démarrage

```bash
npm test
npm run check
```

Le découpage complet est dans `docs/DELIVERY_LOTS.md` et les décisions dans `docs/adr`.

## État du développement

- Lot 0 : fondations et décisions architecturales — terminé.
- Lot 1A : actif de mobilité générique et événements — terminé.
- Lot 1B : organisations multi-activités, établissements, RBAC local, clients, attribution d'acquisition et audit — terminé.
- Lot 1C : API HTTP v1, contexte d'identité vérifié, adaptateurs PostgreSQL et parcours organisation → client → actif — terminé.
- Lot 1D : PostgreSQL reproductible, migrations immuables, OIDC/JWT et permissions appliquées aux routes — terminé.
- Lot 1E : adhésions persistantes, invitations sécurisées, rôles et périmètres établissement — terminé.
- Lot 1F : première interface de gestion et parcours d'onboarding — terminé.
- Lot 1G : configuration marque blanche partagée entre site, application client et portail — terminé.
- Lot 2A : catalogue de prestations, disponibilités et réservation multi-canal — terminé.
- Lot 2B : rappels, échéances, passeport numérique et QR sécurisé — terminé.
- Lot 2C : documents, consentements et partage contrôlé du passeport — terminé.
- Lot 3A : CRM, demandes multi-canal, pipelines, tâches et automatisations — terminé.
- Lot 3B : communications transactionnelles, préférences et centre de notifications multicanal — terminé.
- Lot 3C : moteur de workflows métier, affectations, SLA et files de travail — terminé.
- Lot 3D : devis, tarification, taxes, marges et règles commerciales — terminé.
- Lot 3E : commandes, facturation, échéances et paiements — terminé.
- Lot 3F : journal comptable, remboursements et rapprochement bancaire — terminé.
- Lot 4A : gestion atelier, ordres de réparation, temps et contrôle qualité — terminé.
- Lot 4B : stock de pièces, réservations et approvisionnement — terminé.
- Lot 4C : fournisseurs, réceptions partielles/complètes et valorisation du stock au coût moyen pondéré — en revue CTO.
- Prochaine tranche : commandes fournisseurs, reliquats, retours et alertes de réapprovisionnement.

### Base locale

```bash
POSTGRES_PASSWORD='<mot-de-passe-local>' docker compose up -d postgres
DATABASE_URL='postgres://aos:<mot-de-passe-local>@127.0.0.1:5432/aos' npm run db:migrate
```

Utilisez un secret local non versionné. Aucun mot de passe n'est fourni dans le dépôt.
