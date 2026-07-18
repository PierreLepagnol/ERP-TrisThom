import type { QuoteCompositionItem, QuoteLineSnapshot } from "@/domain/quote-line";

export type CompositionCatalogItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  foodCostCents?: number;
  productionMinutes: number;
};

export type PredefinedComposition = {
  id: string;
  name: string;
  format: "cocktail" | "buffet" | "plateau";
  active: boolean;
  compositionItems: QuoteCompositionItem[];
  commercialText?: string;
};

const presetItem = (name: string, quantity: number, unit: string, category: string, catalogItemId?: string): QuoteCompositionItem => ({ name, quantity, unit, category, catalogItemId });

// Ces propositions sont des exemples commerciaux : elles sont copiées dans le devis
// au moment de l'application et ne se mettent jamais à jour automatiquement.
export const predefinedCompositions: PredefinedComposition[] = [
  {
    id: "buffet-brasserie-classique",
    name: "Buffet Brasserie classique",
    format: "buffet",
    active: true,
    compositionItems: [
      presetItem("Entrée de saison", 1, "choix", "Entrées"),
      presetItem("Volaille à l'estragon", 1, "choix", "Plats"),
      presetItem("Accompagnement maison", 1, "choix", "Accompagnements"),
      presetItem("Dessert maison", 2, "choix", "Desserts"),
    ],
  },
  {
    id: "buffet-brasserie-vegetarien",
    name: "Buffet Brasserie végétarien",
    format: "buffet",
    active: true,
    compositionItems: [
      presetItem("Entrée végétarienne de saison", 2, "choix", "Entrées"),
      presetItem("Plat végétarien", 1, "choix", "Plats"),
      presetItem("Accompagnement maison", 1, "choix", "Accompagnements"),
      presetItem("Dessert maison", 2, "choix", "Desserts"),
    ],
  },
  {
    id: "cocktail-brasserie-classique",
    name: "Cocktail Brasserie classique",
    format: "cocktail",
    active: true,
    compositionItems: [
      presetItem("Mini sandwich œuf mimosa & ciboulette", 3, "pièces", "Pièces froides", "sandwich-mimosa"),
      presetItem("Tartelette tomate confite, chèvre & basilic", 2, "pièces", "Pièces froides", "tartelette-chevre"),
      presetItem("Pièce chaude du moment", 3, "pièces", "Pièces chaudes"),
      presetItem("Pièce sucrée maison", 2, "pièces", "Desserts"),
    ],
  },
  {
    id: "cocktail-brasserie-sans-porc",
    name: "Cocktail Brasserie sans porc",
    format: "cocktail",
    active: true,
    compositionItems: [
      presetItem("Mini sandwich volaille à l'estragon", 3, "pièces", "Pièces froides", "sandwich-volaille"),
      presetItem("Brochette tomate cerise, mozzarella & pistou", 2, "pièces", "Pièces froides", "brochette-mozza"),
      presetItem("Pièce chaude sans porc", 3, "pièces", "Pièces chaudes"),
      presetItem("Pièce sucrée maison", 2, "pièces", "Desserts"),
    ],
  },
  {
    id: "plateau-froid-classique",
    name: "Plateau froid classique",
    format: "plateau",
    active: true,
    compositionItems: [
      presetItem("Entrée froide", 1, "portion", "Entrées"),
      presetItem("Plat froid", 1, "portion", "Plats"),
      presetItem("Dessert maison", 1, "portion", "Desserts"),
    ],
  },
];

const formulaWords = /cocktail|buffet|plateau|brunch|mariage|menu/i;
const excludedWords = /livraison|personnel|service|vaisselle|option/i;

export function isFormulaLine(line: Pick<QuoteLineSnapshot, "origin" | "catalogItemId" | "category" | "snapshotName" | "label">): boolean {
  if (line.origin === "free" && !line.catalogItemId && !line.category && !line.snapshotName) return false;
  const text = [line.catalogItemId, line.category, line.snapshotName, line.label].filter(Boolean).join(" ");
  if (excludedWords.test(text)) return false;
  return formulaWords.test(text);
}

export function cloneCompositionItems(items: readonly QuoteCompositionItem[]): QuoteCompositionItem[] {
  return items.map((item) => ({ ...item }));
}

export function compositionItemsToCommercialText(items: readonly QuoteCompositionItem[]): string[] {
  return items.filter((item) => item.name.trim()).map((item) => {
    const quantity = item.quantity === undefined ? "" : ` — ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
    return `${item.name.trim()}${quantity}`;
  });
}

export function createCompositionItemFromCatalog(item: CompositionCatalogItem, quantity = 1): QuoteCompositionItem {
  return {
    name: item.name,
    quantity,
    unit: item.unit,
    catalogItemId: item.id,
    category: compositionCategory(item.category),
    estimatedFoodCostCents: item.foodCostCents === undefined ? undefined : Math.round(item.foodCostCents * quantity),
    estimatedProductionMinutes: item.productionMinutes,
  };
}

export function createFreeCompositionItem(name: string, quantity = 1, unit = "portion"): QuoteCompositionItem {
  return { name, quantity, unit, category: "Autres" };
}

export function applyPredefinedComposition<T extends QuoteLineSnapshot>(line: T, preset: PredefinedComposition): T {
  const items = cloneCompositionItems(preset.compositionItems);
  return { ...line, compositionItems: items, details: preset.commercialText ? [preset.commercialText] : compositionItemsToCommercialText(items) };
}

export function applyPersonalizedComposition<T extends QuoteLineSnapshot>(line: T, items: readonly QuoteCompositionItem[]): T {
  const snapshot = cloneCompositionItems(items);
  return { ...line, compositionItems: snapshot, details: compositionItemsToCommercialText(snapshot) };
}

export function applyFreeCompositionText<T extends QuoteLineSnapshot>(line: T, text: string): T {
  return { ...line, details: text.split("\n") };
}

export function removeCompositionItem(items: readonly QuoteCompositionItem[], index: number): QuoteCompositionItem[] {
  return items.filter((_, itemIndex) => itemIndex !== index).map((item) => ({ ...item }));
}

export function moveCompositionItem(items: readonly QuoteCompositionItem[], index: number, direction: -1 | 1): QuoteCompositionItem[] {
  const destination = index + direction;
  if (destination < 0 || destination >= items.length) return cloneCompositionItems(items);
  const result = cloneCompositionItems(items);
  [result[index], result[destination]] = [result[destination]!, result[index]!];
  return result;
}

function compositionCategory(category: string): string {
  if (/froid/i.test(category)) return "Pièces froides";
  if (/chaud/i.test(category)) return "Pièces chaudes";
  if (/dessert|sucr/i.test(category)) return "Desserts";
  if (/entr/i.test(category)) return "Entrées";
  if (/accompagnement/i.test(category)) return "Accompagnements";
  if (/plat/i.test(category)) return "Plats";
  return "Autres";
}
