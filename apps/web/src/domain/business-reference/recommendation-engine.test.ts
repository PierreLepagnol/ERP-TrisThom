// @ts-expect-error Bun supplies this module when running `bun test`; the app does not include Bun's type package.
import { expect, test } from "bun:test";
import { recommendBusinessOffers } from "./recommendation-engine";

const recommend = (eventType: string, guestCount: number, budgetPerPersonCents: number, startTime: string, endTime: string, dietaryRequirements = "") => recommendBusinessOffers({ eventType, guestCount, budgetPerPersonCents, startTime, endTime, dietaryRequirements, sameDayLabels: [] });

test("T01: cocktail entreprise à 30 € propose un cocktail dînatoire", () => expect(recommend("Cocktail entreprise", 50, 3000, "18:00", "20:30")[0]?.familyName).toBe("Cocktail dînatoire renforcé"));
test("T02: afterwork court priorise l'apéritif", () => expect(recommend("Afterwork court", 40, 1800, "18:00", "19:30")[0]?.familyName).toBe("Apéritif maison"));
test("T04: déjeuner assis priorise le buffet", () => expect(recommend("Déjeuner séminaire assis", 80, 2400, "12:00", "14:00")[0]?.familyName).toBe("Buffet repas froid"));
test("T05: réunion individuelle priorise les plateaux", () => expect(recommend("Réunion en plateaux", 20, 2000, "12:00", "13:00")[0]?.familyName).toBe("Plateaux-repas"));
test("T06: lendemain de mariage priorise le brunch", () => expect(recommend("Brunch lendemain de mariage", 60, 2800, "10:00", "13:00")[0]?.familyName).toBe("Brunch"));
test("T07: allergie sévère bloque une composition automatique", () => expect(recommend("Cocktail", 40, 2800, "18:00", "20:00", "Allergie sévère œuf")[0]?.requiresManualApproval).toBe(true));
