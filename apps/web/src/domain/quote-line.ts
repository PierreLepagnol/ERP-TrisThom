export type QuoteLineOrigin = "free" | "catalog" | "recommendation" | "legacy";

export type QuoteCompositionItem = {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  catalogItemId?: string;
  recipeId?: string;
  category?: string;
  estimatedFoodCostCents?: number;
  estimatedProductionMinutes?: number;
  productionBaseId?: string;
};

export type QuoteLineSnapshot = {
  id: string;
  label: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  details?: string[];
  origin?: QuoteLineOrigin;
  catalogItemId?: string;
  unit?: string;
  category?: string;
  snapshotName?: string;
  snapshotDescription?: string;
  compositionItems?: QuoteCompositionItem[];
  estimatedFoodCostCents?: number;
  estimatedProductionMinutes?: number;
  productionBaseIds?: string[];
};

export type CatalogQuoteLineSource = {
  id: string;
  name: string;
  description: string;
  details?: string[];
  unit: string;
  unitPriceCents: number;
  vatRate: number;
  category: string;
  foodCostCents?: number;
  productionMinutes: number;
};

export function quoteLineOrigin(line: Pick<QuoteLineSnapshot, "origin">): QuoteLineOrigin {
  return line.origin ?? "legacy";
}

export function createFreeQuoteLine(id: string): QuoteLineSnapshot {
  return {
    id,
    origin: "free",
    label: "Nouvelle prestation",
    quantity: 1,
    unit: "unité",
    unitPriceCents: 0,
    vatRate: 10,
  };
}

export function createCatalogQuoteLine(
  item: CatalogQuoteLineSource,
  id: string,
  quantity = 1,
): QuoteLineSnapshot {
  return {
    id,
    origin: "catalog",
    catalogItemId: item.id,
    unit: item.unit,
    category: item.category,
    snapshotName: item.name,
    snapshotDescription: item.description,
    label: item.name,
    quantity,
    unitPriceCents: item.unitPriceCents,
    vatRate: item.vatRate,
    details: item.details ? [...item.details] : undefined,
    compositionItems: compositionFromCatalog(item, quantity),
    estimatedFoodCostCents: item.foodCostCents === undefined ? undefined : Math.round(item.foodCostCents * quantity),
    estimatedProductionMinutes: item.productionMinutes,
  };
}

export function createRecommendationQuoteLine(input: {
  id: string;
  name: string;
  summary?: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  composition: string[];
  estimatedFoodCostCents?: number;
  estimatedProductionMinutes?: number;
  productionBaseIds?: string[];
}): QuoteLineSnapshot {
  return {
    id: input.id,
    origin: "recommendation",
    unit: "personne",
    category: "Recommandation",
    snapshotName: input.name,
    snapshotDescription: input.summary,
    label: input.name,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    vatRate: input.vatRate,
    details: [...input.composition],
    compositionItems: compositionItemsFromText(input.composition),
    estimatedFoodCostCents: input.estimatedFoodCostCents,
    estimatedProductionMinutes: input.estimatedProductionMinutes,
    productionBaseIds: input.productionBaseIds,
  };
}

export function compositionItemsFromText(items: readonly string[]): QuoteCompositionItem[] {
  return items.map((item) => {
    const match = item.match(/^(.*?)\s*·\s*(\d+)\s+(pièces|portions)\b/i);
    return match
      ? { name: match[1]!.trim(), quantity: Number(match[2]), unit: match[3].toLowerCase() }
      : { name: item };
  });
}

function compositionFromCatalog(item: CatalogQuoteLineSource, quantity: number): QuoteCompositionItem[] {
  if (item.details?.length) return compositionItemsFromText(item.details);
  return [{
    name: item.name,
    quantity,
    unit: item.unit,
    catalogItemId: item.id,
    category: item.category,
    estimatedFoodCostCents: item.foodCostCents === undefined ? undefined : Math.round(item.foodCostCents * quantity),
    estimatedProductionMinutes: item.productionMinutes,
  }];
}
