import { expect, test } from "bun:test";

import { isCateringRequest, parse1001TraiteurPdf, parseEmailRequest, triageInboxMessage } from "../convex/requestParsing";

test("extracts the useful information from a French catering request", () => {
  const details = parseEmailRequest(`Bonjour je souhaite vous commandez un devis pour un cocktail le 11 octobre
2026 à deuil la barre 95170, 40 personnes pouvez vous me proposer quelque
chose de froid svp

Mathilde tran`);

  expect(details).toEqual({
    contactName: "Mathilde Tran",
    eventDate: Date.UTC(2026, 9, 11),
    eventAddress: "Deuil-la-Barre 95170",
    guestCount: 40,
    eventType: "Cocktail froid",
    specialNeeds: "Proposition froide souhaitée",
  });
});

test("recognises and reads a forwarded client request", () => {
  const text = `---------- Forwarded message ---------
From: Gaelle Corniere <gaelle_moreau@barry-callebaut.com>
Date: Wed, Apr 1, 2026 at 10:46 AM
Subject: 15 Personnes - 14-15 Avril

Bonjour Messieurs,

Nouvelle journée de formation les 14 et 15 Avril,
Pouvez-vous svp me faire une proposition en froid uniquement pour ces deux journées,

Plateau mixte + Plateau végé
Mini sandwichs au choix
Compotes (jour 1)
Salades de fruits (jour 2)

Belle journée

Gaëlle Corniere

Coordinatrice Chocolate Academy
Responsable Boutique Cacao Barry

06 78 64 78 73
Barry Callebaut France
5 Boulevard Michelet
78250 HARDRICOURT`;

  expect(isCateringRequest(text)).toBe(true);
  expect(parseEmailRequest(text, new Date(Date.UTC(2026, 3, 1)))).toMatchObject({
    contactName: "Gaëlle Corniere",
    contactEmail: "gaelle_moreau@barry-callebaut.com",
    contactPhone: "06 78 64 78 73",
    organizationName: "Barry Callebaut France",
    eventDate: Date.UTC(2026, 3, 14),
    eventAddress: "5 Boulevard Michelet 78250 Hardricourt",
    guestCount: 15,
    eventType: "Plateaux-repas froids",
  });
});

test("keeps an uncertain email for manual review instead of ignoring it", () => {
  expect(triageInboxMessage("Bonjour, merci pour votre retour. À bientôt.")).toBe("review");
});

test("reads the main fields from a 1001 Traiteur PDF", () => {
  const text = `Bonjour,
J'organise un événement de type « Anniversaire ».
L'événement se tiendrait le samedi 17 octobre 2026 à Fontenay-en-Parisis (Val-d'Oise), à partir de 19:00. Nous attendons environ 80 convives.
Notre budget est d'environ 20 € par personne.
Pour échanger sur notre projet, je préfère être contactée par email.
Merci d'avance pour vos propositions.
Cordialement,
Morgane Martin
morgane.martin83@orange.fr
+33 6 79 32 37 68`;

  expect(parseEmailRequest(text)).toMatchObject({
    contactName: "Morgane Martin",
    contactEmail: "morgane.martin83@orange.fr",
    contactPhone: "+33 6 79 32 37 68",
    eventDate: Date.UTC(2026, 9, 17),
    guestCount: 80,
    eventType: "Anniversaire",
    budgetPerPersonCents: 2000,
  });
});

test("reads 1001Traiteur client fields without using its legal footer", () => {
  const text = `Demande de devis 1001 Traiteurs
Type d'événement : Anniversaire
Nom & prénom internaute : Alice Exemple
E-mail : alice@example.test
Téléphone mobile : +33 6 12 34 56 78
Ville : Ville-Test
Date : 12/09/2026
Horaire de début : 13h30
10 convives
Budget : 50 € par personne
Informations complémentaires
Plateaux repas/box
Afro-caribéen
Gastronomique
Cordialement
Alice Exemple
1001 Traiteurs – Rond-point européen
1001Services est une société du Groupe 1001Salles
SAS au capital de 45.000 €
RCS de Créteil - SIRET 123 456 789 00012 - APE 6312 - TVA Intra`;

  expect(parseEmailRequest(text)).toMatchObject({
    contactName: "Alice Exemple",
    contactEmail: "alice@example.test",
    contactPhone: "+33 6 12 34 56 78",
    organizationName: undefined,
    eventType: "Anniversaire",
    eventDate: Date.UTC(2026, 8, 12),
    eventAddress: "Ville-Test",
    eventStartTime: "13:30",
    guestCount: 10,
    budgetPerPersonCents: 5000,
  });
  expect(parseEmailRequest(text).specialNeeds).toContain("Plateaux repas/box");
  expect(parseEmailRequest(text).specialNeeds).toContain("Afro-caribéen");
  expect(parseEmailRequest(text).specialNeeds).toContain("Gastronomique");
});

test("reads labelled 1001Traiteur fields when the legal footer appears first", () => {
  const text = `1001Services est une société du Groupe 1001Salles
SAS au capital de 45.000 € - RCS de Créteil - SIRET 123 456 789 - TVA Intra
Téléphone mobile
+33 6 11 22 33 44
Nom & prénom internaute
DURAND
Adresse email
emilien@example.test
Date de l'événement
05/09/2026
Ville
Saint-Denis
Nombre de participants
80
Budget
30 €
MESSAGE
Bonjour, nous organisons un événement de type « Anniversaire » le 5 septembre 2026 à partir de 18:00.
Côté formule, nous pensons à : Cocktail
Nos préférences culinaires : Barbecue et grillades et Cuisine régionale
Cordialement
Emilien DURAND
Page (0) Break`;

  const parsed = parse1001TraiteurPdf(text);
  expect(parsed).toMatchObject({
    contactName: "Emilien Durand",
    contactEmail: "emilien@example.test",
    contactPhone: "+33 6 11 22 33 44",
    organizationName: undefined,
    eventType: "Anniversaire",
    eventDate: Date.UTC(2026, 8, 5),
    eventAddress: "Saint-Denis",
    guestCount: 80,
    budgetPerPersonCents: 3000,
    eventStartTime: "18:00",
  });
  expect(parsed.message).not.toContain("SIRET");
  expect(parsed.specialNeeds).toContain("Cocktail");
  expect(parsed.specialNeeds).toContain("Barbecue et grillades");
  expect(parsed.specialNeeds).toContain("Cuisine régionale");
});
