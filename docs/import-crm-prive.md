# Import CRM historique

Le fichier privé reste hors du dépôt. Placez-le dans `private-data/` ou un dossier personnel, puis définissez le secret côté Convex (`CRM_IMPORT_SECRET`) et dans votre terminal.

Dry-run (aucune écriture) :

`bun run crm:import -- --file C:\chemin\crm_import_prive_2026-07-21.json`

Import réel :

`$env:CRM_IMPORT_SECRET="votre-secret"; bun run crm:import -- --file C:\chemin\crm_import_prive_2026-07-21.json --apply`

Le script travaille par lots de 20. Il est relançable : les dossiers sont identifiés par `source` et `externalSourceId`, jamais par le nom ou l'e-mail. En cas d'interruption, relancez exactement la même commande. Après validation, supprimez le fichier privé local ou conservez-le hors du dépôt.
