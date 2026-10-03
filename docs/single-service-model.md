# Un dossier, une prestation

Le dossier est l’unité commerciale et opérationnelle. Ses champs de date, horaires, lieu, format et quantité sont la seule source de vérité. Le devis conserve son état documentaire ; un rappel ne change pas le statut du dossier.

Les anciennes valeurs a_qualifier, qualifie et relance restent lisibles pour une transition sans suppression de données. Les nouvelles écritures utilisent nouveau, devis_a_preparer et devis_envoye.

Les lignes requestEvents historiques sont conservées comme archives de reprise. Tant que leur reprise n’est pas validée, le dossier doit être signalé et ses données opérationnelles protégées. Aucun devis, achat ou montant ne doit être recopié automatiquement sur plusieurs dossiers. Une décision humaine doit attribuer les documents existants avant la séparation des dates.

Qonto, facturation et synchronisation Google Calendar restent hors de cette remise à plat.
