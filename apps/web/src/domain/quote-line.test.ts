// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import { calculateQuoteTotals } from "./quote-calculation";
import {
  createCatalogQuoteLine,
  createFreeQuoteLine,
  createRecommendationQuoteLine,
  quoteLineOrigin,
} from "./quote-line";

test("une ancienne ligne reste lisible et est considérée legacy en mémoire", () => {
  expect(quoteLineOrigin({})).toBe("legacy");
  expect(quoteLineOrigin({ origin: undefined })).toBe("legacy");
});

test("une ligne libre a une origine et une unité par défaut", () => {
  const line = createFreeQuoteLine("free-1");
  expect(line).toMatchObject({ id: "free-1", origin: "free", unit: "unité" });
  expect(line.catalogItemId).toBeUndefined();
});

test("une ligne catalogue conserve son origine et sa photographie commerciale", () => {
  const item = { id: "sandwich-mimosa", name: "Mini sandwich œuf mimosa", description: "Navette garnie", details: ["Œuf mimosa"], unit: "pièce", unitPriceCents: 180, vatRate: 10, category: "Pièces froides", foodCostCents: 55, productionMinutes: 45 };
  const line = createCatalogQuoteLine(item, "catalog-1", 100);
  expect(line).toMatchObject({ origin: "catalog", catalogItemId: "sandwich-mimosa", unit: "pièce", category: "Pièces froides", snapshotName: "Mini sandwich œuf mimosa", snapshotDescription: "Navette garnie", unitPriceCents: 180, vatRate: 10, estimatedFoodCostCents: 5_500, estimatedProductionMinutes: 45 });
});

test("modifier le catalogue après coup ne modifie pas la ligne photographiée", () => {
  const item = { id: "buffet", name: "Buffet", description: "Version initiale", unit: "personne", unitPriceCents: 2_000, vatRate: 10, category: "Formules", foodCostCents: 700, productionMinutes: 120 };
  const line = createCatalogQuoteLine(item, "catalog-2", 20);
  item.name = "Buffet modifié";
  item.unitPriceCents = 9_999;
  expect(line).toMatchObject({ label: "Buffet", snapshotName: "Buffet", unitPriceCents: 2_000 });
});

test("une recommandation conserve ses informations internes et sa composition structurée", () => {
  const line = createRecommendationQuoteLine({ id: "recommendation-1", name: "Cocktail dînatoire", summary: "Format cocktail", quantity: 50, unitPriceCents: 2_500, vatRate: 10, composition: ["Mini sandwich œuf mimosa · 100 pièces", "Table à partager"], estimatedFoodCostCents: 62_000, estimatedProductionMinutes: 180 });
  expect(line).toMatchObject({ origin: "recommendation", estimatedFoodCostCents: 62_000, estimatedProductionMinutes: 180 });
  expect(line.compositionItems).toEqual([{ name: "Mini sandwich œuf mimosa", quantity: 100, unit: "pièces" }, { name: "Table à partager" }]);
});

test("le calcul financier reste identique avec les nouvelles métadonnées", () => {
  const line = createCatalogQuoteLine({ id: "delivery", name: "Livraison", description: "", unit: "forfait", unitPriceCents: 1_000, vatRate: 20, category: "Options", productionMinutes: 0 }, "catalog-3");
  expect(calculateQuoteTotals([line], 0)).toMatchObject({ totalHtCents: 1_000, totalVatCents: 200, totalTtcCents: 1_200 });
});
