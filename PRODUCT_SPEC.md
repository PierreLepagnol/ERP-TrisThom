# TrisThom — spécification produit

**Statut :** périmètre validé le 16 juillet 2026  
**Produit :** application privée de gestion commerciale pour Bouillon Comptoir / TrisThom  
**Accès prévu :** `app.bouilloncomptoir.fr`

## 1. Objectif

Centraliser les demandes de devis, suivre chaque dossier commercial, préparer les devis, réserver les prestations confirmées dans Google Agenda et, dans une phase ultérieure, créer les factures dans Qonto.

L'application est destinée à un seul utilisateur au lancement. Elle ne constitue pas un produit SaaS multi-entreprises et ne gère pas encore les rôles d'équipe.

## 2. Parcours commercial

Chaque demande suit ce pipeline :

1. `Nouveau`
2. `À qualifier`
3. `Devis à préparer`
4. `Devis envoyé`
5. `Relance`
6. `Accepté`, `Refusé` ou `Annulé`

Une demande peut être enregistrée même si elle est incomplète. L'application signale alors les informations manquantes avant la génération du devis : date, lieu, type d'événement, nombre de personnes, budget, formule souhaitée, coordonnées du contact et contraintes alimentaires.

Un devis n'immobilise jamais la date. Seul le passage manuel du devis à `Accepté` :

- réserve définitivement la date ;
- exige les horaires de début et de fin ;
- crée un événement Google Agenda ;
- n'exige pas le versement d'un acompte, qui reste une information de suivi.

L'événement Agenda contient le client, la prestation, le nombre d'invités, l'adresse, les horaires et un lien vers le dossier. Aucun créneau de préparation, livraison ou rangement n'est généré au MVP.

## 3. Sources de demandes

| Source | Comportement retenu |
| --- | --- |
| Formulaire du site | Le site et Directus restent inchangés. Un webhook Directus transmet chaque nouvelle demande à l'application. |
| E-mail | La boîte `contact@bouilloncomptoir.fr`, hébergée chez Zimbra, est surveillée via IMAP. Les demandes probables arrivent dans `À vérifier`, puis sont confirmées manuellement. |
| Téléphone | Création manuelle d'un dossier, source `Téléphone`. |
| 1001traiteur | Création manuelle d'un dossier, source `1001traiteur`, avec pièce jointe de la fiche ou du PDF reçu quand disponible. |

Les devis sont envoyés depuis `contact@bouilloncomptoir.fr` via SMTP. L'application génère le PDF et prépare un brouillon d'e-mail ; l'envoi reste toujours manuel. Les échanges et l'horodatage d'envoi sont conservés dans le dossier.

## 4. CRM et données

Une fiche contact comprend au minimum nom, e-mail et téléphone. Elle peut être rattachée à une société comprenant raison sociale, SIRET et adresse de facturation. Ce modèle couvre les particuliers comme les événements professionnels.

Un dossier de demande regroupe :

- source, statut, priorité et prochaine action ;
- client et société éventuelle ;
- date, horaires, lieu et adresse ;
- format, nombre de personnes, budget et contraintes alimentaires ;
- messages, notes internes, pièces jointes et historique des actions ;
- devis, montants et lien de facturation Qonto ;
- informations d'acompte, sans effet sur la confirmation.

Le catalogue est géré manuellement dans l'application via un écran d'administration. Il contient formules, options, tarifs, unités, règles de quantité et taux de TVA par article. Les devis autorisent aussi les remises et lignes libres.

Le MVP ne calcule pas les coûts matière ni les marges : les fiches techniques et la rentabilité détaillée sont un futur module de production.

## 5. Devis et facturation

Le MVP utilise un seul modèle de devis PDF, à la marque Bouillon Comptoir, avec sections optionnelles. Il doit inclure une numérotation séquentielle, les informations légales, les conditions, les lignes de prestation, la TVA, le total et une durée de validité.

L'acceptation du devis est renseignée manuellement après réception de l'accord ou de la signature du client. La signature électronique ou le bouton d'acceptation en ligne ne font pas partie du MVP.

Qonto est la source de vérité pour les factures. Dans la troisième phase, l'application préremplit puis crée une facture Qonto uniquement à l'initiative de l'utilisateur, depuis un devis accepté ou un événement réalisé. L'application conserve le lien et l'état de la facture, sans remplacer Qonto.

## 6. Relances et accueil

Après l'envoi d'un devis, l'application crée des relances à J+3 et J+7. Elles sont visibles dans le calendrier et le tableau de bord ; aucun e-mail de relance n'est envoyé automatiquement.

L'écran d'accueil reprend l'intention du visuel validé :

- demandes actives et devis à préparer ;
- valeur du pipeline et taux de transformation ;
- priorités commerciales et relances à échéance ;
- prochaines prestations ;
- répartition du pipeline par statut ;
- recherche globale, bouton de création de demande et état des connexions.

## 7. Migration initiale

Le fichier `CRM UPDATE Juin 26 updated (16).xlsx` est la source historique principale :

- importer `CRM Propre` pour les dossiers ;
- consolider les fiches depuis `Clients` ;
- importer `À vérifier` en alertes associées aux dossiers ;
- exclure les tableaux de bord, calculs et feuilles de production.

Les anciens PDF de devis ne sont pas importés au MVP. Directus apporte les nouvelles demandes seulement : aucune synchronisation de retour vers Directus n'est prévue.

## 8. Confidentialité et sécurité

- Application privée, authentifiée et déployée sur `app.bouilloncomptoir.fr`.
- Secrets des connexions Directus, Zimbra, Google et Qonto stockés côté serveur, jamais dans le navigateur.
- Webhook Directus authentifié par secret partagé.
- Les prospects sans contrat sont anonymisés après cinq ans sans interaction. Les données nécessaires à la facturation restent gérées dans Qonto selon les obligations applicables.

## 9. Feuille de route

### Phase 1 — CRM et planning

Tableau de bord, CRM, demandes manuelles, import Excel, webhook Directus, pipeline, relances et synchronisation Google Agenda lors de l'acceptation.

#### Configuration Directus

Créer un flux Directus sur l'événement de création de la collection `quote_requests` qui envoie une requête `POST` vers :

```text
https://<votre-deploiement-convex>.convex.site/webhooks/directus/quote-request
```

Ajouter l'en-tête `x-tristhom-webhook-secret` avec la même valeur que le secret `DIRECTUS_WEBHOOK_SECRET` configuré dans Convex. Le webhook lit les champs Directus actuels : `id`, `name`, `email`, `phone`, `format` ou `catering_format`, `guest_count`, `event_date`, `event_address` et `message`.

### Phase 2 — E-mails et devis

Connexion Zimbra IMAP/SMTP, boîte `À vérifier`, catalogue, génération du devis PDF et brouillon d'e-mail avec historique d'envoi.

### Phase 3 — Factures

Connexion Qonto, création manuelle préremplie de facture depuis un dossier, stockage du lien et de l'état de la facture.

## 10. Hors périmètre actuel

- Gestion des équipes, rôles et espaces multi-entreprises.
- Acceptation et signature en ligne des devis.
- Envoi automatique de devis ou de relances.
- Synchronisation retour vers Directus.
- Lecture automatique des demandes PDF `1001traiteur`.
- Créneaux logistiques internes dans Google Agenda.
- Fiches techniques, coûts matière, fournisseurs et marge détaillée.
