# Découpage du développement en lots

Chaque lot livre une capacité exploitable. P0 désigne le pilote, pas la limite du produit.

| Lot | Résultat livré | Dépend de | Critère de sortie |
|---|---|---|---|
| 0 — Fondations | Monorepo, conventions, CI, environnements, observabilité, ADR, sécurité, multi-tenant | — | tests et contrôles d'architecture verts ; aucun nom client dans le Core |
| 1 — Core identité et actifs | Organisations multi-sites/multi-activités, utilisateurs/RBAC, clients, actifs configurables, consentements, audit | 0 | isolation tenant testée ; voiture, moto et bateau créés par le même contrat |
| 2 — Passeport & relation client | Passeport actif, QR sécurisé, documents, médias, échéances, rappels, prise de rendez-vous sans application | 1 | parcours QR → identité/consentement → RDV → suivi démontré |
| 3 — CRM & workflows | Leads, opportunités, tâches, pipelines configurables, modèles, automatisations, messagerie | 1 | workflow vente et workflow atelier configurés sans code spécifique |
| 4 — Atelier & interventions | Planning, ordres de réparation, diagnostic, devis, validation, pièces, temps, contrôle qualité | 1,2,3 | parcours demande → OR → facture → historique passeport complet |
| 5 — Commerce véhicules | Stock, reprise, achat, préparation, annonce, vente classique, flash, enchères, livraison | 1,3 | stock publié une fois vers surface pro et plateforme centrale |
| 6 — Pièces & équipement | Catalogue, compatibilité, fournisseurs, commandes, stock, e-commerce, pose | 1,4 | boucle pièce → intervention → marge et traçabilité |
| 7 — Finance, documents & conformité | Devis, commandes, factures, paiements, commissions, Cerfa/démarches, signature, preuve | 1,3 | chaîne documentaire et financière auditable de bout en bout |
| 8 — Fabrique marque blanche | Design tokens, domaines, CMS/SEO, site pro, portail client, configuration PWA/app | 1–7 | une nouvelle marque est créée par configuration, sans fork |
| 9 — Application centrale de réservation | Expérience type Booking/Doctolib : recherche multi-prestations, disponibilité, comparaison, profils, avis, réservation et paiement | 1–8 | un client réserve n'importe quelle prestation éligible depuis une seule application, sans cannibaliser le canal direct pro |
| 10 — Réseau professionnel | Boutique privée, prix pro, apporteurs, commissions, sous-traitance, transporteurs, partenaires | 1,5–7 | transaction inter-pro tracée, facturée et attribuée |
| 11 — Connecteurs & import/export | DMS/ERP, stock, VIN, CT, paiement, assurance, financement, logistique, annonces, webhooks/SDK | 0–10 | connecteur remplaçable, sandboxé, versionné et supervisé |
| 12 — International & IA | Multi-pays, langues, devises, fiscalité/règles, import Japon/Dubaï, assistant IA encadré | 1–11 | locale ajoutée sans fork ; recommandations explicables et révocables |
| 13 — Industrialisation | feature flags, migrations, rollback, health engine, SLO, PRA, pentest, montée en charge | tous | pilote production exploitable et procédure de reprise testée |

## Ordre de construction retenu

La première boucle commerciale combine les lots 1 à 8 par tranches verticales : **actif/CRM/workflow/document/finance**, puis **Commerce + Atelier + Pièces**, avec le QR et la fabrique de sites dès la première vague. Les droits et le réseau sont modélisés dès le départ. Les partenaires restent interchangeables.

## Matrice des applications et canaux

| Surface | Utilisateurs | Marque visible | Périmètre |
|---|---|---|---|
| Application centrale de réservation | grand public | marque de la plateforme | tous les professionnels, activités et prestations publiés |
| Application de gestion | dirigeants, équipes et partenaires autorisés | produit SaaS, personnalisable | CRM, planning, stock, atelier, commerce, pièces, finance, réseau et configuration |
| Espace client dans l'application de gestion | clients rattachés à un professionnel | marque du professionnel dans le contexte client | rendez-vous, suivi, devis, paiements, factures, messages, documents et passeports |
| Application client marque blanche | clients directs d'un professionnel | marque du professionnel | catalogue et parcours adaptés aux activités activées |
| Site internet marque blanche | prospects et clients directs | marque et domaine du professionnel | SEO, contenus, prestations, stock, réservation, devis, paiement et espace client web |

Une réservation conserve toujours son canal d'origine (`central_marketplace`, `professional_app`, `professional_website`, `staff`, `partner`, `api`) afin de gérer correctement propriété client, commission, attribution et statistiques.

## Mesures produit obligatoires

- temps administratif économisé ;
- marge par vente/intervention/pièce ;
- délai et taux de résolution ;
- conversion demande → devis → paiement ;
- rétention client et retour atelier ;
- part de demandes captées en direct par le professionnel.

## Suivi des tranches actives

| Tranche | Statut | Capacité |
|---|---|---|
| 4C — Réceptions et valorisation | Terminé | fournisseurs par organisation, commandes d'achat par site, réceptions partielles et coût moyen pondéré transactionnel |
| 4D — Retours et réapprovisionnement | Terminé | fermeture des reliquats, retours fournisseur atomiques et alertes par seuil de stock disponible |
| 5A — Stock véhicules | Terminé | acquisition, préparation, prix et publication séparée vers les canaux directs ou la plateforme centrale |
| 5B — Merchandising véhicule | Terminé | checklist obligatoire, image principale et préparation auditable avant publication |
| 5C — Vente véhicule | Terminé | vente verrouillée, marge brute, retrait atomique des annonces et événement outbox |
