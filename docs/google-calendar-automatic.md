# Synchronisation automatique ERP vers Google Agenda

Désactivée par défaut : le déploiement seul ne lance aucun appel Google. Réutilise les trois variables Google existantes et le moteur de synchronisation existant.

Les écritures CRM, imports, reprise, entrées e-mail et suggestions sur requests alimentent une file persistante. Les modifications du devis courant actualisent aussi la logistique. Aucun appel Google pendant la sauvegarde ERP.

Une tentative automatique possède un bail exclusif de 15 minutes par dossier. Les erreurs sont réessayées après 1, 2, 4… minutes, jusqu'à 6 heures entre tentatives. Le cron toutes les 5 minutes reprend les travaux échoués/abandonnés et parcourt tous les dossiers par pages de 25, sans limite aux 500 premiers ni au mois d'octobre. Il fonctionne ordinateur éteint.

- Nouveau dossier : création pour aujourd'hui ou une date future, même non confirmé.
- Dossier lié : mise à jour du même événement, même si sa date est ensuite déplacée dans le passé.
- Vert : confirmé ; orange : devis envoyé/relance ; jaune : autres stades actifs.
- Sans date, archivé, supprimé : aucune création ni mise à jour ; événement existant conservé.
- Terminé : historique conservé.
- Perdu/annulé : retrait seulement après vérification de la marque privée requestId de l'événement ERP. L'identifiant reste réservé ; une réouverture restaure le même événement lorsque sa propriété ERP reste vérifiable et Google permet sa restauration.
- Événement manuel, récurrent ou appartenant à un autre dossier : aucune modification/suppression, erreur visible dans le suivi interne.
- Événement lié introuvable : aucun nouvel identifiant ; vérification manuelle nécessaire.
- Exclusions d'octobre conservées par prudence : anciens doublons, Monastère et les trois Lydia. Elles ciblent uniquement les dossiers précis validés, jamais les nouveaux dossiers portant le même nom.

## Déployer et examiner sans activer

```powershell
Set-Location 'C:\Users\thoma\ERP-TrisThom\packages\backend'
bunx convex deployment select polished-cricket-455
if ($LASTEXITCODE -ne 0) { throw 'Sélection échouée.' }
bunx convex dev --once
if ($LASTEXITCODE -ne 0) { throw 'Déploiement échoué.' }
bunx convex run googleCalendarAutomation:status '{}' --deployment-name polished-cricket-455
bunx convex run googleCalendarAutomation:previewAutomatic '{}' --deployment-name polished-cricket-455
```

Preview paginé, sans appel Google : si isDone vaut false, reprendre avec le cursor retourné pour examiner la suite.

## Activer après validation

Cette commande déclenche des écritures réelles et le rattrapage des dossiers existants :

```powershell
bunx --% convex run googleCalendarAutomation:setEnabled "{\"enabled\":true,\"confirmation\":\"AUTOMATIC_GOOGLE_CALENDAR\"}" --deployment-name polished-cricket-455
```

## Vérifier

```powershell
bunx convex run googleCalendarAutomation:status '{}' --deployment-name polished-cricket-455
```

Créer un dossier futur de test dans l'ERP : un seul événement jaune doit apparaître. Modifier adresse, personnes, date et horaires : même événement mis à jour. Envoyer le devis : orange ; accepter : vert. Annuler : événement ERP retiré. Un événement manuel Google reste intact. Terminer un dossier synchronisé conserve son historique.

Le suivi affiche status, attempt, message et prochaineTentative, sans identifiant Google (100 travaux au maximum). Les reprises s'effectuent côté Convex.

L'ERP actuellement local doit enregistrer sur ce déploiement Convex : les dossiers qui resteraient uniquement dans le stockage du navigateur ne sont pas accessibles au backend.

## Désactiver

```powershell
bunx --% convex run googleCalendarAutomation:setEnabled "{\"enabled\":false,\"confirmation\":\"AUTOMATIC_GOOGLE_CALENDAR\"}" --deployment-name polished-cricket-455
```

Les tâches/réservations restent disponibles pour reprise. La désactivation ne supprime aucun événement.

## Tests locaux

À la racine : bun test packages/backend/test/googleCalendarPlanning.test.ts ; bun run check-types ; bun run build.
Dans packages/backend : bun run test:calendar.
Les tests utilisent Convex et Google simulés, sans accès aux comptes réels. convex-test est fixé à 0.0.54, dernière version compatible avec le Convex du projet ; les versions plus récentes exigent Convex 1.43.
