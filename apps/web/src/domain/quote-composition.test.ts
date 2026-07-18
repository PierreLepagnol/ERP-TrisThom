import { describe, expect, it } from "bun:test";
import {
  applyFreeCompositionText,
  applyPersonalizedComposition,
  applyPredefinedComposition,
  compositionItemsToCommercialText,
  createCompositionItemFromCatalog,
  createFreeCompositionItem,
  isFormulaLine,
  predefinedCompositions,
  removeCompositionItem,
} from "./quote-composition";

const line = { id: "line", label: "Buffet Brasserie", quantity: 20, unitPriceCents: 2200, vatRate: 10, origin: "catalog" as const, category: "Formules buffet" };

describe("quote composition", () => {
  it("identifies formula lines and excludes logistics", () => {
    expect(isFormulaLine(line)).toBe(true);
    expect(isFormulaLine({ ...line, label: "Livraison", category: "Services" })).toBe(false);
    expect(isFormulaLine({ ...line, label: "Personnel de service", category: "Services" })).toBe(false);
    expect(isFormulaLine({ ...line, origin: "free", category: undefined, label: "Ligne libre cocktail" })).toBe(false);
  });

  it("copies a preset independently into the quote", () => {
    const preset = predefinedCompositions[0]!;
    const applied = applyPredefinedComposition(line, preset);
    applied.compositionItems![0]!.name = "Modifié";
    expect(preset.compositionItems[0]!.name).not.toBe("Modifié");
  });

  it("keeps catalog links and free elements in a personalized composition", () => {
    const catalogItem = createCompositionItemFromCatalog({ id: "salade", name: "Salade de saison", category: "Entrées", unit: "portion", foodCostCents: 220, productionMinutes: 15 }, 20);
    const applied = applyPersonalizedComposition(line, [catalogItem, createFreeCompositionItem("Pain maison", 2, "paniers")]);
    expect(applied.compositionItems?.[0]?.catalogItemId).toBe("salade");
    expect(applied.compositionItems?.[1]?.catalogItemId).toBeUndefined();
    expect(removeCompositionItem(applied.compositionItems!, 0)).toHaveLength(1);
  });

  it("generates commercial text without losing structure when client text is edited", () => {
    const structured = applyPersonalizedComposition(line, [createFreeCompositionItem("Mini sandwich", 80, "pièces")]);
    expect(compositionItemsToCommercialText(structured.compositionItems!)).toEqual(["Mini sandwich — 80 pièces"]);
    const freeText = applyFreeCompositionText(structured, "Texte client adapté");
    expect(freeText.details).toEqual(["Texte client adapté"]);
    expect(freeText.compositionItems).toEqual(structured.compositionItems);
  });

  it("does not change a line until a composition is applied", () => {
    expect(line.compositionItems).toBeUndefined();
    expect(line.details).toBeUndefined();
  });
});
