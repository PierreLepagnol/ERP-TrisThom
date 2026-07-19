// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import {
  canSaveOverQuoteVersion,
  isQuoteDraftModified,
  selectQuoteVersion,
} from "./quote-draft";

const quote = (overrides = {}) => ({
  template: "cocktail",
  issueDate: 1_700_000_000_000,
  validUntil: 1_700_604_800_000,
  depositPercent: 50,
  included: "Cuisine et dressage",
  excluded: "Boissons",
  logistics: "Accès à confirmer",
  introduction: "Bonjour",
  conditions: "Acompte",
  remarks: "",
  discountCents: 0,
  lines: [{ id: "technical-id", label: "Cocktail", quantity: 20, unitPriceCents: 2_000, vatRate: 10, details: ["10 pièces"] }],
  updatedAt: 1,
  ...overrides,
});

test("un brouillon identique à la version enregistrée n’est pas modifié", () => {
  expect(isQuoteDraftModified(quote(), quote({ updatedAt: 99, lines: [{ ...quote().lines[0]!, id: "other-id" }] }))).toBe(false);
});

test("un changement de quantité est détecté", () => {
  expect(isQuoteDraftModified(quote({ lines: [{ ...quote().lines[0]!, quantity: 21 }] }), quote())).toBe(true);
});

test("un changement de composition est détecté", () => {
  expect(isQuoteDraftModified(quote({ lines: [{ ...quote().lines[0]!, details: ["12 pièces"] }] }), quote())).toBe(true);
});

test("les horodatages et identifiants techniques sont ignorés", () => {
  expect(isQuoteDraftModified(quote({ updatedAt: 2, id: "draft-id" }), quote({ updatedAt: 3, id: "saved-id" }))).toBe(false);
});

test("une version envoyée ne peut pas être écrasée", () => {
  expect(canSaveOverQuoteVersion("envoye", "brouillon")).toBe(false);
  expect(canSaveOverQuoteVersion("accepte", "envoye")).toBe(false);
  expect(canSaveOverQuoteVersion("refuse", "brouillon")).toBe(false);
});

test("une version prête peut passer à envoyée", () => {
  expect(canSaveOverQuoteVersion("pret", "envoye")).toBe(true);
});

test("une nouvelle version peut être préparée après un envoi", () => {
  expect(canSaveOverQuoteVersion(undefined, "brouillon")).toBe(true);
});

test("l’impression d’une version explicitement sélectionnée utilise cette version", () => {
  const versions = [{ id: "v1" }, { id: "v2" }];
  expect(selectQuoteVersion(versions, "v2", "v1")).toEqual({ id: "v1" });
  expect(selectQuoteVersion(versions, "v2")).toEqual({ id: "v2" });
});
