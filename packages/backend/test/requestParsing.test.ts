import { expect, test } from "bun:test";

import { isCateringRequest, parse1001TraiteurForm, parse1001TraiteurPdf, parseEmailRequest, triageInboxMessage, type PositionedPdfDocument } from "../convex/requestParsing";

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

test("never uses the 1001 footer when pdf text is flattened into one line", () => {
  const text = "SAS au capital de 45.000 € - RCS de Créteil – SIRET 430 085 241 00031 – APE 6312 Z – TVA Intra N° FR 50430085241 1001Services est une société du Groupe 1001Salles – 1001traiteurs.com est un service internet de la société 1001Services 1001 Traiteurs – Rond-point européen – 11 rue Maurice Grandcoing – 94200 Ivry sur Seine MESSAGE Bonjour, je souhaite un événement de type Anniversaire le 12/09/2026 à partir de 13:30. Cordialement Blandine Exemple Adresse email blandine@example.test Téléphone mobile +33 6 34 51 79 76 Budget 50 € Nombre de participants 10 Nom & prénom internaute Blandine Exemple Ville Cergy Date de l'événement 12/09/2026";

  const parsed = parse1001TraiteurPdf(text);
  expect(parsed).toMatchObject({
    contactName: "Blandine Exemple",
    contactEmail: "blandine@example.test",
    contactPhone: "+33 6 34 51 79 76",
    organizationName: undefined,
    eventType: "Anniversaire",
    eventDate: Date.UTC(2026, 8, 12),
    eventAddress: "Cergy",
    guestCount: 10,
    budgetPerPersonCents: 5000,
    eventStartTime: "13:30",
  });
  expect(parsed.contactName).not.toContain("SIRET");
  expect(parsed.message).not.toContain("1001Services");
});

const headers = ["Date de la demande", "Date de l'événement", "Pays", "Région", "Département", "Ville", "Budget", "Nombre de participants", "Nom & prénom internaute", "Adresse email", "Téléphone fixe", "Téléphone mobile"];
function form(values: Partial<Record<(typeof headers)[number], string>>, message: string[], footerFirst = false): PositionedPdfDocument {
  const headerRow = { y: 10, fragments: headers.map((text, index) => ({ x: index * 10, y: 10, text })), text: headers.join(" ") };
  const valueFragments = headers.flatMap((label, index) => values[label] ? [{ x: index * 10, y: 11, text: values[label]! }] : []);
  const rows = [headerRow, { y: 11, fragments: valueFragments, text: valueFragments.map((fragment) => fragment.text).join(" ") }, { y: 20, fragments: [{ x: 0, y: 20, text: "MESSAGE" }], text: "MESSAGE" }, ...message.map((text, index) => ({ y: 21 + index, fragments: [{ x: 0, y: 21 + index, text }], text }))];
  const footer = { y: 1, fragments: [{ x: 0, y: 1, text: "SAS au capital de 45.000 € - RCS de Créteil - SIRET 430 085 241 - APE 6312 - TVA Intra - 1001Services - Ivry sur Seine" }], text: "SAS au capital de 45.000 € - RCS de Créteil - SIRET 430 085 241 - APE 6312 - TVA Intra - 1001Services - Ivry sur Seine" };
  return { rows: footerFirst ? [footer, ...rows] : [...rows, footer], rawText: "contrôle" };
}
function report(name: string, parsed: ReturnType<typeof parse1001TraiteurForm>) {
  console.log(name, JSON.stringify({ contactName: parsed.contactName, contactEmail: parsed.contactEmail, contactPhone: parsed.contactPhone, organizationName: parsed.organizationName, eventType: parsed.eventType, eventDate: parsed.eventDate, eventStartTime: parsed.eventStartTime, eventAddress: parsed.eventAddress, guestCount: parsed.guestCount, budgetCents: parsed.budgetCents, budgetPerPersonCents: parsed.budgetPerPersonCents, formule: parsed.specialNeeds, preferences: parsed.specialNeeds, message: parsed.message }));
}

test("parses six positioned 1001 form layouts without using provider data", () => {
  const cases = [
    { name: "anniversaire cocktail", filename: "Anniversaire.pdf", doc: form({ "Date de l'événement": "17/10/2026", Ville: "Ville-A", Budget: "20 €", "Nombre de participants": "80", "Nom & prénom internaute": "MARTIN", "Adresse email": "martin@example.test", "Téléphone mobile": "06 11 22 33 44" }, ["Événement de type Anniversaire à partir de 19:00", "Côté formule : Cocktail", "Cordialement", "Marie Martin"]), expected: { contactName: "Marie Martin", eventType: "Anniversaire", guestCount: 80, budgetPerPersonCents: 2000 } },
    { name: "anniversaire buffet", filename: "Anniversaire.pdf", doc: form({ "Date de l'événement": "09/10/2027", Ville: "Ville-B", Budget: "25 €", "Nombre de participants": "100", "Nom & prénom internaute": "DUPONT", "Adresse email": "dupont@example.test", "Téléphone mobile": "07 11 22 33 44" }, ["Anniversaire", "Côté formule : Buffet", "Cordialement", "Jean Dupont"]), expected: { eventType: "Anniversaire", guestCount: 100, budgetPerPersonCents: 2500 } },
    { name: "plateaux afro caribéen", filename: "Anniversaire.pdf", doc: form({ "Date de l'événement": "12/09/2026", Ville: "Ville-C", Budget: "50 €", "Nombre de participants": "10", "Nom & prénom internaute": "NOM", "Adresse email": "c@example.test", "Téléphone mobile": "+33 6 12 34 56 78" }, ["Anniversaire à partir de 13:30", "Côté formule : Plateaux repas/box", "Nos préférences culinaires : Afro-", "caribéen", "Cordialement", "Claire Exemple"]), expected: { contactName: "Claire Exemple", eventStartTime: "13:30", budgetPerPersonCents: 5000, specialNeeds: "Côté formule : Plateaux repas/box · Nos préférences culinaires : Afro-caribéen" } },
    { name: "côté cuisine", filename: "Anniversaire.pdf", doc: form({ "Date de l'événement": "05/09/2026", Ville: "Ville-D", Budget: "30 €", "Nombre de participants": "40", "Nom & prénom internaute": "NOM", "Adresse email": "d@example.test" }, ["Anniversaire", "Côté cuisine : Buffet et Cocktail", "Cordialement", "David Exemple"]), expected: { eventType: "Anniversaire", budgetPerPersonCents: 3000 } },
    { name: "1001Salles secours fichier", filename: "Événement-Mariage.pdf", doc: form({ "Date de l'événement": "29/08/2026", Ville: "Ville-E", Budget: "35 €", "Nombre de participants": "60", "Nom & prénom internaute": "E", "Adresse email": "e@example.test" }, [] , true), expected: { eventType: "Mariage", guestCount: 60 } },
    { name: "message vide budget global", filename: "Demande.pdf", doc: form({ "Date de l'événement": "15/04/2027", Ville: "Ville-F", Budget: "1500 €", "Nombre de participants": "80", "Nom & prénom internaute": "F", "Adresse email": "f@example.test", "Téléphone mobile": "N.C" }, []), expected: { contactPhone: undefined, budgetCents: 150000, budgetPerPersonCents: undefined, message: undefined } },
  ];
  for (const item of cases) {
    const parsed = parse1001TraiteurForm(item.doc, item.filename);
    report(item.name, parsed);
    expect(parsed).toMatchObject({ organizationName: undefined, ...item.expected });
    expect(JSON.stringify(parsed)).not.toContain("SIRET");
    expect(JSON.stringify(parsed)).not.toContain("1001Services");
  }
});
