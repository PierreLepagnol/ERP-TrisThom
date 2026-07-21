import { expect, test } from "bun:test";

import { isCateringRequest, parseEmailRequest, triageInboxMessage } from "../convex/requestParsing";

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
