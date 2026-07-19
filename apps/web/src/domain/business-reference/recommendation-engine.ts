import { businessReference } from "./index";
import type { ProductionLoad, ReferenceCatalogItem } from "./types";

export type RecommendationInput = { eventType?: string; message?: string; guestCount: number; budgetCents?: number; budgetPerPersonCents?: number; dietaryRequirements?: string; specialNeeds?: string; staffingNeeds?: string; startTime?: string; endTime?: string; sameDayLabels: string[] };
export type BusinessRecommendation = { id: string; familyName: string; summary: string; composition: string[]; totalTtcCents: number; priceTtcPerPersonCents: number; foodCostCents?: number; foodCostSharePercent?: number; load: ProductionLoad; score: number; productionBaseNames: string[]; reasons: string[]; warnings: string[]; requiresManualApproval: boolean };

const text = (value?: string) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const durationMinutes = (start?: string, end?: string) => {
  if (!start || !end) return undefined;
  const parse = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
  return parse(end) - parse(start);
};
const resolveCommercialPrice = (familyId: string, pieces: number) => {
  const format = familyId === "aperitif-maison" ? "Cocktail — 8 pièces"
    : familyId === "cocktail-convivial" ? (pieces >= 12 ? "Cocktail — 12 pièces" : "Cocktail — 8 pièces")
    : familyId === "cocktail-dinatoire-renforce" ? "Cocktail — 12 pièces"
    : familyId === "buffet-repas-froid" ? "Buffet Brasserie"
    : familyId === "buffet-repas-chaud" ? "Buffet Brasserie"
    : familyId === "plateaux-repas" ? "Plateau chaud"
    : familyId === "brunch" ? "Brunch Bouillon" : undefined;
  return businessReference.pricingPolicies.find((policy) => policy.format === format)?.publicPriceTtc;
};
const familyOrder = (input: RecommendationInput) => {
  const event = text(`${input.eventType} ${input.message} ${input.specialNeeds}`);
  const seated = /assis|dejeuner|diner|repas|seminaire/.test(event);
  const individual = /reunion|formation|plateau/.test(event);
  const brunch = /brunch|lendemain|matin|petit-dejeuner|baby shower/.test(event);
  const standing = /cocktail|afterwork|inauguration|vernissage|aperitif|debout/.test(event);
  const duration = durationMinutes(input.startTime, input.endTime);
  const short = duration !== undefined && duration <= 120;
  const long = (duration ?? 0) > 180 || /long|midi-soir/.test(event);
  const budgetPerPerson = input.budgetPerPersonCents ?? (input.budgetCents ? Math.round(input.budgetCents / input.guestCount) : 0);
  const accompanied = /mariage|service|plancha|personnel|animation|materiel/.test(event);
  if (brunch) return ["brunch", "buffet-repas-froid", "aperitif-maison"];
  if (individual) return ["plateaux-repas", "buffet-repas-froid"];
  if (accompanied) return ["prestation-accompagnee", standing ? "cocktail-dinatoire-renforce" : "buffet-repas-froid"];
  if (standing && short) return ["aperitif-maison", "cocktail-convivial", "buffet-repas-froid"];
  if (standing && (long || budgetPerPerson >= 2500)) return ["cocktail-dinatoire-renforce", "cocktail-convivial", "buffet-repas-froid"];
  if (standing) return ["cocktail-convivial", "aperitif-maison", "buffet-repas-froid"];
  if (seated) return ["buffet-repas-froid", "buffet-repas-chaud", "plateaux-repas"];
  return ["cocktail-convivial", "buffet-repas-froid"];
};
const temperature = (item: ReferenceCatalogItem) => text(item.temperature);
const incompatible = (item: ReferenceCatalogItem, requirements: string) => {
  const requirement = text(requirements);
  const allergens = text(item.allergens.join(" "));
  const diets = text(item.diets.join(" "));
  const name = text(item.name);
  if (/sans gluten|celiaque/.test(requirement) && /gluten/.test(allergens)) return true;
  if (/sans lait|sans lactose/.test(requirement) && /lait/.test(allergens)) return true;
  if (/sans oeuf|allergie.*oeuf/.test(requirement) && /oeuf/.test(allergens)) return true;
  if (/fruit.*coque|allergie.*noix/.test(requirement) && /noix|amande|pesto|pistou/.test(allergens)) return true;
  if (/poisson|crustace/.test(requirement) && /poisson|crustace/.test(allergens)) return true;
  if (/sans porc|halal/.test(requirement) && /porc|jambon|rosette|coppa|saucisse|alcool/.test(name)) return true;
  if (/vegan|vegetalien/.test(requirement) && !/vegan/.test(diets)) return true;
  if (/vegetarien/.test(requirement) && /omnivore/.test(diets)) return true;
  return false;
};
const quantity = (perPerson: number, guests: number, item: ReferenceCatalogItem) => {
  const raw = perPerson * guests;
  const multiple = item.productionMultiple || 1;
  return Math.max(item.minimumQuantity || 1, Math.ceil(raw / multiple) * multiple);
};
const select = (familyId: string, input: RecommendationInput, count: number, temperatureNeed?: RegExp) => {
  const labels = text(input.sameDayLabels.join(" "));
  return businessReference.catalogItems.filter((item) => item.active && item.compatibleOfferFamilyIds.includes(familyId) && !incompatible(item, input.dietaryRequirements ?? "") && (!temperatureNeed || temperatureNeed.test(temperature(item)))).sort((a, b) => {
    const aShared = itemShared(a, labels), bShared = itemShared(b, labels);
    return bShared - aShared || a.materialCostPerUnitCents - b.materialCostPerUnitCents;
  }).slice(0, count);
};
const itemShared = (item: ReferenceCatalogItem, labels: string) => item.productionBaseIds.some((base) => labels.includes(base.replace(/-/g, " "))) ? 1 : 0;
const difficulty = (item: ReferenceCatalogItem) => /elevee|high/.test(text(item.difficulty)) ? 3 : /moyenne|medium/.test(text(item.difficulty)) ? 2 : 1;

export function recommendBusinessOffers(input: RecommendationInput): BusinessRecommendation[] {
  const severe = /allergie severe|anaphylax|traces|contamination croisee/.test(text(input.dietaryRequirements));
  if (severe) return [{ id: "validation-allergie", familyName: "Validation humaine", summary: "Allergie sévère : aucune composition automatique n'est proposée.", composition: [], totalTtcCents: 0, priceTtcPerPersonCents: 0, load: { activeMinutes: 0, referenceCount: 0, difficultyScore: 0, fragileItemCount: 0 }, score: 0, productionBaseNames: [], reasons: ["Risque de contamination croisée à valider avec la production."], warnings: ["Génération finale bloquée."], requiresManualApproval: true }];
  return familyOrder(input).flatMap((familyId) => {
    const family = businessReference.offerFamilies.find((entry) => entry.id === familyId);
    if (!family) return [];
    const pieces = familyId === "aperitif-maison" ? 6 : familyId === "cocktail-convivial" ? 12 : familyId === "cocktail-dinatoire-renforce" ? 10 : 1;
    const cold = /cocktail/.test(familyId) ? select(familyId, input, familyId === "cocktail-convivial" ? 3 : 2, /froid/) : [];
    const hot = /cocktail/.test(familyId) ? select(familyId, input, 2, /chaud/) : [];
    const sweet = /cocktail/.test(familyId) ? select(familyId, input, 1, /sucre/) : [];
    const items = [...cold, ...hot, ...sweet];
    if (!items.length && /cocktail/.test(familyId)) return [];
    const perItem = items.length ? Math.max(1, Math.floor(pieces / items.length)) : 1;
    const composition = items.map((item) => `${item.name} · ${quantity(perItem, input.guestCount, item)} ${item.portionLabel.includes("pièces") ? "pièces" : "portions"}`);
    if (familyId === "cocktail-dinatoire-renforce") composition.push("Table à partager ou salade complémentaire · à composer selon le lieu");
    if (/buffet/.test(familyId)) composition.push("Entrées, plat, accompagnement et desserts · composition à finaliser");
    if (familyId === "plateaux-repas") composition.push("Entrée, plat, garniture et dessert · une variante végétarienne possible");
    if (familyId === "brunch") composition.push("Boulangerie, salé, chaud, fruits et douceurs · boissons séparées");
    const price = Math.round((resolveCommercialPrice(familyId, pieces) ?? 0) * 100);
    const totalTtcCents = price * input.guestCount;
    const foodCostCents = items.length ? items.reduce((total, item) => total + quantity(perItem, input.guestCount, item) * item.materialCostPerUnitCents, 0) : undefined;
    const totalHt = totalTtcCents / 1.1;
    const foodCostSharePercent = foodCostCents === undefined || !totalHt ? undefined : Math.round((foodCostCents / totalHt) * 100);
    const bases = [...new Set(items.flatMap((item) => item.productionBaseIds))];
    const load = { activeMinutes: items.reduce((total, item) => total + (item.activeTimeMinutes ?? 0), 0), referenceCount: items.length, difficultyScore: items.reduce((total, item) => total + difficulty(item), 0), fragileItemCount: items.filter((item) => /elevee|high/.test(text(item.transportFragility))).length };
    const budget = input.budgetCents ?? (input.budgetPerPersonCents ? input.budgetPerPersonCents * input.guestCount : undefined);
    const budgetGap = budget === undefined ? undefined : totalTtcCents - budget;
    const sharedBases = bases.filter((base) => text(input.sameDayLabels.join(" ")).includes(base.replace(/-/g, " ")));
    const overBudget = budget !== undefined && budgetGap !== undefined && budgetGap > budget * .1;
    const warnings = [
      ...(overBudget ? ["Budget insuffisant pour cette structure : proposez une alternative ou une validation commerciale."] : []),
      ...(foodCostSharePercent !== undefined && foodCostSharePercent > 35 ? ["Coût matière estimé élevé : validation avant envoi."] : []),
      ...(items.some((item) => item.dataStatus !== "real") ? ["Une partie de la composition repose sur des estimations à valider."] : []),
      ...(familyId === "buffet-repas-chaud" ? ["Vérifier la remise en température et les équipements du lieu."] : []),
      ...(familyId === "prestation-accompagnee" ? ["Personnel, matériel et installation doivent être validés et chiffrés séparément."] : []),
    ];
    const needScore = familyId === familyOrder(input)[0] ? 25 : 16;
    const budgetScore = budgetGap === undefined || budget === undefined ? 12 : budgetGap <= 0 ? 20 : Math.max(0, 20 - Math.round((budgetGap / budget) * 100));
    const marginScore = foodCostSharePercent === undefined ? 8 : foodCostSharePercent <= 32 ? 15 : Math.max(0, 15 - (foodCostSharePercent - 32));
    const score = Math.max(0, Math.min(100, needScore + budgetScore + marginScore + 15 + 10 + (sharedBases.length ? 10 : 0) + 5));
    return [{ id: familyId, familyName: family.name, summary: family.structure, composition, totalTtcCents, priceTtcPerPersonCents: price, foodCostCents, foodCostSharePercent, load, score, productionBaseNames: bases.map((base) => businessReference.productionBases.find((entry) => entry.id === base)?.name ?? base), reasons: [`Format retenu : ${family.customerNeed}.`, ...(sharedBases.length ? [`Mutualisation possible : ${sharedBases.length} base(s) déjà repérée(s) ce jour.`] : []), `Score explicable : ${score}/100.`], warnings, requiresManualApproval: warnings.some((warning) => /validation|verifier/i.test(warning)) }];
  }).slice(0, 3);
}
