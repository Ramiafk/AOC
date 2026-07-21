# AOC — Vision produit et domaine

## Positionnement

AOC est un système d’exploitation SaaS pour l’écosystème des véhicules. Il relie les professionnels, leurs équipes, leurs sites, leurs prestataires et leurs clients tout en leur permettant d’exploiter leurs propres canaux numériques.

AOC n’est pas uniquement une place de marché automobile et n’est pas uniquement un logiciel de garage.

Le produit comprend deux niveaux complémentaires :

1. **La plateforme centrale AOC**, utilisée pour le réseau professionnel, les échanges de services, les recommandations, les transactions, la donnée véhicule et les services communs.
2. **Les canaux propres à chaque professionnel**, notamment site web, application professionnelle et application client, configurables en marque blanche ou sous sa marque.

Un professionnel peut utiliser AOC comme outil interne sans publier toutes ses données sur la plateforme centrale. Les permissions, audiences et contrats de diffusion doivent donc être explicites.

## Véhicules couverts

Le modèle doit rester générique et extensible :

- voitures et véhicules utilitaires ;
- motos et scooters ;
- quads et SSV ;
- bateaux et autres véhicules nautiques ;
- véhicules de loisirs ;
- engins et autres actifs motorisés ou sérialisés.

Une règle véritablement commune doit utiliser le vocabulaire `vehicle`/`asset`. Les règles spécifiques à une catégorie doivent vivre dans une extension de domaine, pas dans des conditions dispersées.

## Professionnels et prestataires

AOC doit pouvoir servir et connecter notamment :

- garages, ateliers et centres d’entretien ;
- concessionnaires, distributeurs et marchands ;
- carrossiers, peintres et débosseleurs ;
- centres de contrôle et d’inspection ;
- préparateurs esthétiques et techniques ;
- spécialistes pneumatiques, vitrage, électronique et diagnostic ;
- vendeurs et distributeurs de pièces ;
- transporteurs, dépanneurs et logisticiens ;
- assureurs, courtiers, financeurs et garanties ;
- experts, photographes, documentaristes et prestataires administratifs ;
- ports, chantiers nautiques et spécialistes de véhicules non automobiles ;
- tout autre prestataire autorisé par les activités configurées.

Chaque tenant peut contenir plusieurs organisations et plusieurs sites. Les autorisations doivent distinguer tenant, organisation, site, équipe, rôle et parfois ressource.

## Clients et continuité de service

Le client peut appartenir à un professionnel tout en recevant un service d’un autre professionnel du réseau.

Exemple : un garage de Lille vend un véhicule à un client vivant à Montpellier. Il peut recommander un garage à Montpellier pour les entretiens. Le garage de Lille ne gagne une commission que sur la prestation explicitement recommandée ou sur le contrat d’entretien vendu, pas sur les opérations futures non recommandées comme une reprise indépendante.

Le système doit donc conserver :

- l’origine de la recommandation ;
- la prestation ou le contrat précis concerné ;
- le consentement et l’audience des données partagées ;
- le professionnel exécutant ;
- la règle de commission ;
- l’événement déclencheur de la commission ;
- l’expiration, l’annulation et les litiges ;
- l’absence de droit sur les prestations ultérieures hors périmètre.

Les professionnels peuvent aussi s’échanger du travail et convenir de commissions entre eux. Ces accords doivent être explicites, versionnés et auditables.

## Contrats et services récurrents

Un professionnel peut vendre ou recommander :

- une prestation unique ;
- un forfait ;
- un contrat d’entretien pluriannuel ;
- une garantie ;
- un abonnement ;
- une prestation exécutée par un partenaire ;
- une combinaison de services répartis entre plusieurs sites.

Le vendeur, l’exécutant, le payeur, le bénéficiaire, le commissionné et le responsable du support peuvent être différents. Le modèle ne doit pas les confondre.

## Capacités produit principales

### Identité et réseau

- tenants, organisations, sites, équipes et activités ;
- professionnels vérifiés et annuaire ;
- permissions fines et délégations ;
- contacts, clients, sociétés et consentements ;
- recommandations et relations partenaires.

### Véhicule et passeport

- identité véhicule/actif ;
- propriétaires successifs ;
- passeport et historique vérifiable ;
- entretiens, réparations, sinistres, contrôles et documents ;
- photos, vidéos, inspection et preuves ;
- partage contrôlé entre propriétaire et professionnels.

### Atelier et services

- catalogue de prestations ;
- disponibilités et réservation ;
- ordres de travail ;
- devis, facturation et paiement ;
- pièces, fournisseurs, commandes, réceptions, stock et retours ;
- contrats d’entretien, garanties et récurrence.

### CRM et expérience client

- leads, opportunités et pipeline ;
- rappels, campagnes, notifications et workflows ;
- application client du professionnel ;
- rendez-vous, documents, factures et suivi ;
- historique multicanal et préférences.

### Commerce véhicule

- acquisition, reprise et dépôt-vente ;
- préparation, inspection, médias et publication ;
- vente, livraison, transfert de propriété et dossier réglementaire ;
- ventes flash, enchères, garanties et achat immédiat ;
- diffusion distincte vers site professionnel, application professionnelle et plateforme centrale.

### Marketplace et enchères cibles

Le produit doit évoluer vers deux audiences :

- **espace professionnel vérifié**, réservé aux métiers autorisés ;
- **espace public**, visible et utilisable par les particuliers selon les règles de l’annonce.

Chaque vente ou enchère définit son audience : professionnel, public ou mixte.

La cible fonctionnelle des enchères comprend :

- cycles de 24 heures ;
- jusqu’à trois cycles consécutifs avec historique séparé ;
- passage en achat immédiat après le dernier cycle selon la stratégie du vendeur ;
- prix de réserve pour les véhicules appartenant à un particulier ou à un tiers ;
- bouton d’achat immédiat au prix autorisé ;
- acceptation, refus ou contre-proposition du propriétaire lorsque la réserve n’est pas atteinte ;
- garanties prestataire, enchères automatiques et règles anti-sniping dans des lots dédiés ;
- frais acheteur/vendeur, logistique, litiges et conformité explicitement modélisés.

### Fiche véhicule complète

Une publication de qualité peut inclure :

- caractéristiques, finition, énergie, transmission, kilométrage et origine ;
- essai routier et démarrage à froid ;
- moteur, transmission, freinage, direction, suspension, voyants et bruits ;
- pneumatiques, vitrage, jantes, carrosserie et intérieur ;
- défauts localisés sur un schéma avec photos ;
- historique d’entretien, factures, contrôle technique, sinistres et kilométrages ;
- nombre de clés, documents et éléments manquants ;
- photos, vidéo, son moteur et rapport d’inspection ;
- niveau de confiance, auteur et date de chaque observation.

La fiche doit distinguer faits observés, déclarations du propriétaire, données importées et informations vérifiées.

## Principes de monétisation

AOC peut monétiser sans rendre les règles opaques :

- abonnement SaaS par organisation/site/utilisateur ;
- modules et canaux en option ;
- commission de mise en relation ou de transaction ;
- commission contractuelle sur une prestation précise ;
- frais marketplace, enchère, garantie, paiement ou logistique ;
- services premium de données, inspection, média et diffusion ;
- applications et sites en marque blanche.

Toute commission doit disposer d’une base contractuelle, d’un périmètre, d’un calcul, d’un bénéficiaire, d’une preuve et d’un statut de règlement.

## Principes de confiance

- pas de partage implicite de données entre professionnels ;
- pas de commission sur une opération non attribuable à la recommandation ;
- pas de modification silencieuse de l’historique ;
- pas de mélange entre prix indicatif, réserve, adjudication et prix final ;
- pas de stockage de données de carte ;
- preuves et outbox atomiques pour les opérations critiques ;
- confidentialité par défaut, audiences explicites et audit complet ;
- vocabulaire et UX adaptés au métier et au type de véhicule.

## Règle pour les agents

Chaque lot doit améliorer une capacité cohérente de cette vision sans tenter de construire toute la plateforme dans une seule PR. Les idées nouvelles sont classées en :

- blocage nécessaire au lot courant ;
- recommandation pour un lot prochain ;
- idée stratégique à placer dans la roadmap.
