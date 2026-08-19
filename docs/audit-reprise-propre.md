# Audit de reprise — TrisThom

Date : 19 août 2026  
Branche auditée : `codex/reprise-propre`, créée à partir de `codex/reprise-app` (`9aaa77a9`).

## État global

Le monorepo est fonctionnellement cohérent et compile. Il contient une application web TanStack Start/Vite dans `apps/web`, un backend Convex dans `packages/backend/convex`, et les packages partagés `ui`, `env` et `config`.

- **Confirmé localement** : typecheck, build, 83 tests unitaires, parsing de demandes (e-mail et 1001Traiteur), webhook et synchronisation Directus, calcul/versions de devis.
- **Présent mais non testé de bout en bout** : Better Auth, envoi SMTP, lecture IMAP, webhook Directus réel et synchronisation Directus réelle. Aucun appel externe n'a été lancé, pour ne pas envoyer d'e-mail ni créer/modifier de données.
- **Non implémenté malgré la spécification** : synchronisation Google Agenda et intégration Qonto. Le schéma ne conserve pour Agenda qu'un statut et un identifiant éventuels ; aucun connecteur n'est présent.

## Résultats des validations

| Commande | Résultat |
| --- | --- |
| `bun run check-types` | OK — code de sortie 0 |
| `bun run build` | OK — code de sortie 0 ; build Vite client et SSR réussi |
| `bun test` | OK — 83 tests, 0 échec, 234 assertions |

La première exécution de typecheck/build a été bloquée avant compilation par le sandbox Node (`EPERM` sur `C:\Users\thoma`). La reprise hors sandbox a confirmé les résultats ci-dessus. Ce n'est pas un défaut du projet.

## Architecture et routes

L'accès authentifié regroupe le tableau de bord, les demandes, le détail et les devis, les prestations, les clients, le catalogue et le calendrier. Une route d'impression de devis est également présente.

Le frontend initialise `ConvexBetterAuthProvider`, puis `ConvexCrmProvider`. Ce dernier appelle les mutations/queries de `crm.ts`, mais conserve l'interface TypeScript historique `LocalCrm`. `local-crm.tsx` (1 925 lignes) est toujours livré car il fournit les types, les fonctions utilitaires et les données de démonstration ; `convex-crm.tsx` (417 lignes) effectue l'adaptation. `crm.ts` regroupe 1 349 lignes de lectures, transitions, devis, catalogue, prestations et données démo.

Le schéma Convex sépare déjà correctement demandes, notes, historique, relances, devis, versions, lignes, messages e-mail, catalogue, contacts et organisations. Les tables `contacts`/`organizations` ne sont toutefois pas alimentées par le flux CRM courant : les coordonnées sont encore dupliquées dans `requests` et les clients affichés sont dérivés des demandes.

## Connexions essentielles

| Connexion | Statut | Constats vérifiés |
| --- | --- | --- |
| Frontend ↔ Convex | **À tester** | `VITE_CONVEX_URL` et `VITE_CONVEX_SITE_URL` sont validées au démarrage. Les URL locales ne sont pas des placeholders et correspondent au même déploiement que `packages/backend/.env.local`. Les queries/mutations sont typées et le build passe, mais aucune requête n'a été exécutée contre le cloud. |
| Better Auth ↔ Convex | **Configuration manquante à vérifier** | Better Auth est correctement enregistré dans `convex.config.ts` et `auth.config.ts`, avec magic link et token Convex. `BETTER_AUTH_SECRET`, `SITE_URL` et SMTP sont requis dans l'environnement Convex. L'existence de ces variables distantes et la délivrance d'un lien n'ont pas été testées. |
| Directus ↔ Convex | **Architecture fragile** | Le webhook POST `/webhooks/directus/quote-request` exige `x-tristhom-webhook-secret`; sans secret il répond 503, avec un mauvais secret 401. Il accepte les enveloppes Directus, JSON double-encodé et retours à la ligne bruts. L'idempotence est assurée par `(source=directus, externalSourceId)`. Le cron de secours, toutes les 5 min, lit `quote_requests` (100 derniers, tri décroissant), avec 3 tentatives/10 s et journalise un bilan technique. La configuration et l'appel réel Directus restent à tester. |
| E-mail ↔ Convex | **Configuration manquante à vérifier** | Le cron IMAP s'exécute toutes les 10 min, lit au plus 20 messages non vus par passage et déduplique sur l'UID IMAP. Il crée/attache une demande selon `In-Reply-To`, puis à défaut par e-mail client, avec un classement manuel des messages incertains. Les messages 1001Traiteur et les PDF sont analysés. SMTP est une action authentifiée qui envoie réellement puis enregistre l'historique. Aucune connexion IMAP/SMTP n'a été ouverte durant l'audit. |

### Parcours Directus vérifié dans le code

`quote_requests` dans Directus → Flow Directus → POST `.convex.site/webhooks/directus/quote-request` + header secret → `handleDirectusQuoteRequest` → mutation interne `directus.ingestRequest` → `requests` et `requestHistory`. En cas de perte du webhook : cron `directusSync.syncRecentRequests` → `GET /items/quote_requests` → même mutation d'ingestion.

Champs lus : `id`/`key`, `name`, `email`, `phone`, `catering_format` ou `format`, `guest_count`, `event_date`, `event_address`, `message`.

## Variables réellement utilisées

| Variable | Emplacement | Requise | Rôle / symptôme si absente |
| --- | --- | --- | --- |
| `VITE_CONVEX_URL` | `apps/web/.env` | Oui | URL `.cloud` du client Convex ; l'application refuse de démarrer si absente/invalide. |
| `VITE_CONVEX_SITE_URL` | `apps/web/.env` | Oui | URL `.site` de Better Auth ; même validation. |
| `CONVEX_DEPLOYMENT`, `CONVEX_URL`, `CONVEX_SITE_URL` | `packages/backend/.env.local` | Oui pour CLI/dev | Sélection et URL du déploiement Convex. |
| `BETTER_AUTH_SECRET` | Variables Convex | Oui | Signature Better Auth ; le déploiement est invalide sans elle. |
| `SITE_URL` | Variables Convex | Optionnelle dans le code, obligatoire en pratique | Origine Better Auth ; sinon repli sur `http://localhost:3001`, inadapté en production. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Variables Convex | Oui | Magic links et e-mails clients ; les actions échouent si elles manquent ou si port/secure est invalide. |
| `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE` | Variables Convex | Oui | Poller de boîte ; absence ou valeur invalide fait échouer le cron. L'utilisateur/mot de passe IMAP réutilisent `SMTP_USER`/`SMTP_PASSWORD`. |
| `DIRECTUS_WEBHOOK_SECRET` | Variables Convex + Flow Directus | Optionnelle dans le schéma, requise pour webhook | Webhook renvoie 503 sans secret. |
| `DIRECTUS_BASE_URL` | Variables Convex | Optionnelle | Sans elle, le cron de secours journalise `directus_not_configured`. |
| `DIRECTUS_STATIC_TOKEN` | Variables Convex | Optionnelle selon Directus | Token Bearer du rattrapage ; sans lui, la requête est anonyme. |
| `CRM_IMPORT_SECRET` | Variables Convex + terminal d'import | Optionnelle | Requise seulement pour `crm:import --apply`; l'import réel s'arrête sans elle. |

La documentation `SETUP.md` documente correctement Better Auth, SMTP et le webhook Directus, mais omet les trois variables IMAP et les deux variables du rattrapage Directus. Elle ne peut donc pas, à elle seule, rendre le poller ou la synchronisation de secours opérationnels.

## Inventaire et décision

| Classement | Éléments |
| --- | --- |
| **Garder** | Schéma Convex normalisé pour devis/versions/lignes/relances, webhook Directus et ses journaux, synchronisation de secours, parser e-mail/PDF et ses tests, calcul des devis, catalogue, historique et protections Better Auth sur les actions e-mail/PDF. |
| **Simplifier** | Adaptateur `convex-crm.tsx`, agrégation workspace/dashboard côté client, `crm.ts` à découper par responsabilité, flux 1001Traiteur (import manuel PDF et lecture IMAP se chevauchent), documentation d'installation. |
| **Remplacer plus tard** | Contrat `LocalCrm` comme API interne du frontend : il fige le modèle historique et force de nombreux casts. La liste des clients dérivée de `requests` doit à terme consommer les tables contacts/organisations. |
| **Supprimer plus tard** | Provider local et données démo, une fois les types/utilitaires extraits et les écrans migrés. Ne pas les supprimer avant : ils alimentent encore toutes les routes par types et helpers. |

## Risques

### Critiques

1. `clearAllRequests` est exposée par le provider frontend comme `resetDemoData`, alors qu'elle efface les données de travail. La mutation exige bien un utilisateur authentifié, mais l'application ne gérant pas encore de rôles, tout utilisateur connecté pourrait l'exécuter si un écran la rend accessible. La restreindre avant tout usage de production.
2. Le rattrapage Directus relit les 100 dernières demandes toutes les 5 minutes. L'idempotence empêche les doublons, mais une panne longue ou plus de 100 nouvelles demandes peut laisser des éléments non récupérés sans curseur persistant.

### Importants

1. Deux vocabulaires de statuts coexistent (`a_qualifier`, `qualifie`, `relance` sont explicitement décrits comme historiques dans le frontend), et les règles existent à la fois dans `crm.ts` et `domain/request-status.ts`.
2. Le poller identifie un message par UID `INBOX`, qui n'est pas stable après déplacement/recréation de boîte et ne déduplique pas par `Message-ID`. Le rattachement de secours par e-mail peut attacher une réponse au mauvais dossier si un client a plusieurs demandes actives.
3. Les connexions externes dépendent de variables Convex qui ne sont pas toutes documentées. L'environnement distant n'a pas été inspecté.
4. Les opérations CRM et `workspace` font des collectes/agrégations globales ; cela est acceptable pour une petite base, mais devient un point de performance à surveiller.

### Secondaires

1. Le build signale seulement un diagnostic de temps de plugins Vite/TanStack, non bloquant.
2. Les tests sont solides pour les parsers, Directus et le domaine de devis, mais il n'existe pas de test Convex d'intégration du schéma ni de test navigateur/authentification.
3. La spécification annonce Google Agenda, Qonto et anonymisation à cinq ans, absents du code.

## Plan de reprise recommandé

1. **Valider les environnements externes.** Vérifier en lecture seule les noms des variables Convex et le diagnostic du webhook ; envoyer une demande Directus de test dans un environnement non productif. Résultat : une demande unique et deux journaux de succès.
2. **Rendre l'installation complète.** Documenter IMAP et le rattrapage Directus, puis ajouter un contrôle de santé sans secret. Résultat : un nouvel environnement peut configurer toutes les connexions listées.
3. **Sécuriser les actions destructives.** Vérifier et restreindre `clearAllRequests`/données démo au développement. Résultat : aucune action exposée ne peut supprimer les demandes de production par erreur.
4. **Stabiliser le flux e-mail.** Ajouter des tests de rattachement et une stratégie de déduplication durable avant de changer le comportement métier. Résultat : un jeu de messages rejoué ne crée ni rattachement erroné ni doublon.
5. **Extraire le contrat CRM.** Créer des types de lecture/commande propres au frontend, puis migrer écran par écran hors de `LocalCrm`, sans modifier les statuts. Résultat : une route migrée, tests inchangés, aucun changement de données.
6. **Découper `crm.ts`.** Après extraction du contrat, séparer demandes, devis, catalogue et prestations en modules Convex. Résultat : API inchangée, typecheck et tests verts.

## Actions manuelles restantes

Dans Convex, contrôler (sans afficher les valeurs) la présence de toutes les variables de la table ci-dessus, distinctes en développement et production. Dans Directus, configurer le Flow de création `quote_requests`, l'URL `.site` du même déploiement et le header `x-tristhom-webhook-secret`; configurer aussi l'URL et le token du rattrapage si souhaité. Dans l'hébergement, renseigner les deux variables `VITE_` correspondant au même déploiement Convex et définir `SITE_URL` sur l'URL publique de l'application.
