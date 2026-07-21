// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import { toConvexQuote } from "./quote-payload";

test("le devis envoyé au serveur exclut les informations internes du catalogue", () => {
  const payload = toConvexQuote({
    version: 1, status: "brouillon", template: "cocktail", issueDate: 1, validUntil: 2,
    depositPercent: 50, included: "", excluded: "", logistics: "", discountCents: 0, updatedAt: 1, versions: [],
    lines: [{ id: "line-1", label: "Apéritif", quantity: 30, unitPriceCents: 2000, vatRate: 10, category: "Recommandation", origin: "recommendation" }],
  });
  expect(payload.lines[0]).toEqual({ id: "line-1", label: "Apéritif", quantity: 30, unitPriceCents: 2000, vatRate: 10, details: undefined });
  expect("category" in payload.lines[0]).toBe(false);
});
