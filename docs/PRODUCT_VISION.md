# AOC — Vision produit de référence

## 1. Mission

AOC est le système d’exploitation SaaS commun aux professionnels du véhicule. Il doit couvrir les entreprises qui vendent, entretiennent, réparent, préparent, transportent, expertisent, financent, assurent ou administrent des actifs roulants ou navigants : automobile, utilitaire, poids lourd, moto, scooter, quad, engin, bateau et catégories futures configurables.

La plateforme ne doit pas imposer un métier unique. Un même tenant peut exploiter plusieurs organisations, plusieurs sites et plusieurs activités. Chaque professionnel conserve sa marque, ses clients directs, ses règles commerciales et ses canaux, tout en pouvant travailler avec le réseau AOC.

## 2. Surfaces du produit

AOC doit fournir cinq surfaces cohérentes, alimentées par les mêmes domaines et permissions :

1. **Application de gestion AOC** : CRM, planning, atelier, stock, commerce, pièces, documents, finance, réseau et configuration.
2. **Site internet marque blanche** : domaine, contenu, SEO, stock, prestations, devis, rendez-vous, paiement et espace client du professionnel.
3. **Application/PWA client marque blanche** : expérience directe du client sous la marque du professionnel.
4. **Portail professionnel** : transactions interprofessionnelles, sous-traitance, approvisionnement, transport, vente et enchères.
5. **Application centrale AOC** : recherche, comparaison, réservation et marketplace lorsque le professionnel choisit d’y publier.

La marque blanche est obtenue par configuration, design tokens, contenus et domaines. Aucun fork par client n’est autorisé.

## 3. Principes métier non négociables

### 3.1 Propriété de la relation et attribution

Chaque demande, réservation, vente ou prestation conserve son canal d’origine. La propriété client et l’attribution commerciale doivent être explicites, auditées et réversibles selon les contrats.

Lorsqu’un garage recommande un prestataire ou un autre garage, la commission porte uniquement sur l’objet recommandé : prestation, contrat d’entretien ou transaction précisément identifiée. Une opération ultérieure sans rapport — par exemple une reprise non recommandée — ne donne aucun droit automatique au premier garage.

Les professionnels peuvent convenir entre eux de commissions, prix nets, contrats pluriannuels et règles de partage. Ces règles doivent être versionnées, datées, tenant-scoped et rattachées à un accord vérifiable.

### 3.2 Multi-tenant, multi-organisation, multi-site

Toute ressource métier appartient au minimum à un tenant et, lorsque pertinent, à une organisation et un site. Les accès ne doivent jamais être déduits d’un simple identifiant opaque. Le périmètre réel doit être résolu avant l’autorisation.

### 3.3 Passeport de l’actif

L’actif possède un historique durable : propriétaires, kilométrage ou heures, entretiens, réparations, contrôles, documents, médias, sinistres déclarés, inspections et transferts. Les éléments inconnus doivent rester explicitement inconnus ; ils ne doivent jamais être affichés comme conformes.

### 3.4 Traçabilité et preuve

Les opérations critiques sont auditables : acteur, date, périmètre, données avant/après, preuve documentaire et événement outbox. Une mutation métier et son événement doivent réussir ou échouer ensemble.

## 4. Vision commerce et enchères

### 4.1 Vente classique

Le stock véhicule doit couvrir acquisition, reprise, dépôt-vente, préparation, inspection, publication multicanale, négociation, vente, livraison, transfert de propriété et dossier de cession.

### 4.2 Enchères par cycles

Le fonctionnement cible comprend :

- campagnes composées de cycles de 24 heures ;
- au maximum trois cycles consécutifs configurables ;
- historique distinct de chaque cycle et de chaque offre ;
- relance idempotente après un cycle non attribué ;
- passage en achat immédiat après le dernier cycle ;
- prix de réserve et statut « réserve atteinte » ;
- clôture atomique en cas de vente directe, retrait ou adjudication ;
- garanties de paiement sans stockage de données de carte ;
- offre maximale automatique et anti-sniping dans des lots dédiés ;
- identité des enchérisseurs non exposée publiquement.

### 4.3 Véhicules appartenant à un tiers

Pour un particulier ou un tiers mandant :

- le propriétaire réel et le mandat sont enregistrés ;
- la réserve est validée par la personne autorisée ;
- une offre sous réserve ne crée jamais une vente automatique ;
- le propriétaire peut accepter, refuser ou contre-proposer ;
- « Acheter maintenant » peut être proposé au prix autorisé ;
- consentements, délais et preuves sont auditables.

### 4.4 Deux audiences

Une annonce ou une enchère peut cibler :

- les professionnels automobiles vérifiés uniquement ;
- le grand public ;
- les deux avec des vues et conditions différentes.

Les prix professionnels, marges, documents internes, frais nets ou informations réservées ne doivent jamais fuir vers la vue publique.

## 5. Fiche véhicule cible

La fiche complète doit pouvoir présenter :

- identité, version, énergie, transmission, équipement et origine ;
- kilométrage, nombre de clés et propriétaires connus ;
- essai routier : démarrage, moteur, boîte, freinage, direction, suspension, bruits et voyants ;
- inspection mécanique, pneumatiques et consommables ;
- carrosserie localisée : rayure, bosse, choc, élément repeint, corrosion, vitrage et jantes ;
- intérieur, sellerie et équipements défectueux ;
- contrôle technique, entretien, factures, réparations et sinistres déclarés ;
- photos, vidéos, audio moteur et documents ;
- versions successives de l’inspection, auteur et date ;
- données adaptées à l’audience professionnelle ou publique.

## 6. Qualité d’expérience

Chaque surface doit être :

- mobile-first et responsive ;
- utilisable au clavier et compatible lecteurs d’écran ;
- claire sur les états, erreurs et délais ;
- rapide sur réseaux mobiles ;
- cohérente grâce à des design tokens ;
- adaptée aux rôles et activités activés ;
- mesurée sans fuite de données entre tenants.

## 7. Mesures produit

AOC doit mesurer au minimum :

- temps administratif économisé ;
- marge par vente, intervention, pièce et contrat ;
- conversion demande → devis → paiement ;
- délai de réponse et de résolution ;
- rétention et retour atelier ;
- performance par canal ;
- part des clients captés directement par le professionnel ;
- qualité des inspections et taux de litige ;
- réussite des enchères, réserve atteinte et temps de rotation du stock.

## 8. Rôle de l’équipe multi-agents

L’équipe autonome doit améliorer continuellement le produit. À chaque lot, elle distingue :

- **bloquant maintenant** : risque qui interdit la fusion ;
- **recommandé prochainement** : amélioration à planifier séparément ;
- **idée stratégique** : différenciation, UX, monétisation ou efficacité future.

Une idée stratégique ne doit jamais être ajoutée silencieusement au lot actif. Elle devient un lot ou une issue séparée.
