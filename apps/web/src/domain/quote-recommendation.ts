import type {
  CatalogItem,
  LocalQuote,
  LocalQuoteLine,
  LocalRequest,
  QuoteTemplate,
} from "@/lib/local-crm";
import { recommendBusinessOffers } from "@/domain/business-reference/recommendation-engine";

export type QuoteRecommendation = {
  id: string;
  title: string;
  quote: Pick<
    LocalQuote,
    "template" | "lines" | "included" | "excluded" | "logistics" | "introduction"
  >;
  totalTtcCents: number;
  foodCostCents?: number;
  foodCostSharePercent?: number;
  reasons: string[];
  warnings: string[];
  requiresManualApproval: boolean;
};

type RecommendationInput = {
  request: LocalRequest;
  catalog: CatalogItem[];
  dayRequests: LocalRequest[];
};

type Candidate = {
  item: CatalogItem;
  template: QuoteTemplate;
  totalTtcCents: number;
  seasonMatch: boolean;
};

const cocktailRecipePlan = [
  ["Mini sandwich œuf mimosa", 2],
  ["Mini sandwich volaille estragon", 2],
  ["Brochette tomate-mozzarella-pistou", 2],
  ["Verrine lentilles et légumes", 1],
  ["Mini croque comté-jambon", 2],
  ["Mini quiche légumes", 1],
  ["Mini pain perdu", 1],
  ["Mini moelleux chocolat ou brochette de fruits", 1],
] as const;

const automaticCapacity = (template: QuoteTemplate, item: CatalogItem) => {
  if (template === "plateau_repas") return 60;
  if (template === "brunch") return 50;
  if (template === "mariage") return 40;
  if (template === "cocktail") {
    if (normalize(item.name).includes("reception")) return 40;
    if (normalize(item.name).includes("brasserie")) return 60;
    return 80;
  }
  return normalize(item.name).includes("chaud") ? 60 : 80;
};

const normalize = (value: string | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const currentSeason = (date: number | undefined) => {
  const month = new Date(date ?? Date.now()).getMonth() + 1;
  if (month === 12 || month <= 2) return "hiver";
  if (month <= 5) return "printemps";
  if (month <= 8) return "ete";
  return "automne";
};

function formatFor(eventType: string | undefined): QuoteTemplate {
  const event = normalize(eventType);
  if (/plateau|seminaire|reunion/.test(event)) return "plateau_repas";
  if (/mariage/.test(event)) return "mariage";
  if (/cocktail|afterwork|inauguration|vernissage|debout/.test(event))
    return "cocktail";
  if (/brunch|petit dejeuner/.test(event)) return "brunch";
  return "buffet_froid";
}

function matchesFormat(item: CatalogItem, template: QuoteTemplate) {
  const category = normalize(item.category);
  if (template === "cocktail") return category.includes("cocktail");
  if (template === "plateau_repas") return category.includes("plateaux");
  if (template === "brunch") return normalize(item.name).includes("brunch");
  if (template === "mariage") return category.includes("buffet");
  return category.includes("buffet");
}

function lineFor(item: CatalogItem, guestCount: number): LocalQuoteLine {
  const quantity = ["personne", "plateau"].includes(normalize(item.unit))
    ? guestCount
    : Math.max(item.minimumQuantity, 1);
  return {
    id: crypto.randomUUID(),
    label: item.name,
    quantity,
    unitPriceCents: item.unitPriceCents,
    vatRate: item.vatRate,
    details:
      normalize(item.name).includes("cocktail brasserie")
        ? cocktailRecipePlan.map(
            ([name, quantity]) => `${name} : ${quantity * guestCount} pièces`,
          )
        : item.details,
  };
}

function totalTtc(line: LocalQuoteLine) {
  return Math.round(
    line.quantity * line.unitPriceCents * (1 + line.vatRate / 100),
  );
}

function dietaryWarnings(request: LocalRequest, item: CatalogItem) {
  const requirements = normalize(request.dietaryRequirements);
  if (!requirements) return [];

  const itemText = normalize(
    [item.name, item.description, ...(item.details ?? [])].join(" "),
  );
  const allergens = [...item.allergens.map(normalize), itemText];
  const warnings = [
    "Contraintes alimentaires à valider dans la composition finale avant envoi.",
  ];
  const conflicts = [
    ["sans gluten|celiaque", "gluten", "gluten"],
    ["sans lactose|sans lait", "lait", "lait"],
    ["crustace|allergie poisson|sans poisson", "poisson", "poisson ou crustacés"],
    ["allergie.*oeuf|sans oeuf", "oeuf", "œuf"],
    ["fruits? a coque|allergie.*noix", "noix|amande|pistou|pesto", "fruits à coque"],
  ] as const;
  for (const [pattern, allergen, label] of conflicts) {
    if (new RegExp(pattern).test(requirements) && allergens.some((value) => new RegExp(allergen).test(value)))
      warnings.push(`Cette formule référence ${label} : ne pas l'envoyer telle quelle.`);
  }
  if (/vegetarien/.test(requirements) && !item.dietary.some((value) => normalize(value).includes("vegetarien")))
    warnings.push("Prévoir une alternative végétarienne pour les convives concernés.");
  if (/vegan|vegetalien/.test(requirements) && !item.dietary.some((value) => normalize(value).includes("vegan")))
    warnings.push("Prévoir une alternative vegan pour les convives concernés.");
  if (/sans porc|halal/.test(requirements) && /porc|jambon|rosette|coppa|rillettes|saucisse/.test(itemText))
    warnings.push("Cette formule contient ou peut contenir du porc : adaptez chaque recette avant envoi.");
  return warnings;
}

function loadWarnings(request: LocalRequest, item: CatalogItem, dayRequests: LocalRequest[]) {
  const sameDay = dayRequests.filter((entry) => entry._id !== request._id);
  const confirmedGuests = sameDay
    .filter((entry) => entry.status === "accepte")
    .reduce((total, entry) => total + (entry.guestCount ?? 0), 0);
  const proposedGuests = sameDay
    .filter((entry) => entry.status !== "accepte")
    .reduce((total, entry) => total + (entry.guestCount ?? 0), 0);
  const warnings: string[] = [];
  if (confirmedGuests + (request.guestCount ?? 0) > item.capacityPerDay)
    warnings.push("La capacité quotidienne renseignée pour cette formule semble dépassée par les prestations confirmées.");
  else if (confirmedGuests + proposedGuests + (request.guestCount ?? 0) > item.capacityPerDay)
    warnings.push("Charge prévisionnelle élevée ce jour-là : vérifiez la capacité avant d'envoyer.");
  return warnings;
}

function eventWarnings(request: LocalRequest, candidate: Candidate) {
  const warnings: string[] = [];
  const event = normalize(request.eventType);
  const start = request.eventStartTime;
  const end = request.eventEndTime;
  if (start && end) {
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (candidate.template === "cocktail" && duration > 240)
      warnings.push("Réception de plus de 4 h : prévoyez une table à partager, des salades ou un plat complémentaire.");
  }
  if (candidate.template === "cocktail" && candidate.totalTtcCents / (request.guestCount ?? 1) < 2_000)
    warnings.push("Sous 20 € TTC par personne, présenter cette piste comme un apéritif léger, pas comme un cocktail dînatoire complet.");
  if (/livraison|mise en place|installation/.test(normalize(request.specialNeeds)))
    warnings.push("Livraison et installation sont à chiffrer dans des lignes séparées.");
  if (/vaisselle|verrerie|boisson|personnel|service/.test(normalize(request.staffingNeeds)))
    warnings.push("Personnel, vaisselle, boissons et matériel restent des options séparées de l'offre alimentaire.");
  if (event.includes("debout") || /cocktail|afterwork|inauguration|vernissage/.test(event)) return warnings;
  if (candidate.template === "cocktail")
    warnings.push("Vérifiez que le client souhaite bien un format debout ; sinon le buffet est souvent plus généreux et plus simple à produire.");
  return warnings;
}

/**
 * Produit des pistes de devis, sans jamais les enregistrer ni les envoyer.
 * Les règles strictes restent visibles sous forme d'alertes afin que le
 * traiteur garde la décision finale sur les recettes et les allergènes.
 */
export function recommendQuotes({ request, catalog, dayRequests }: RecommendationInput): QuoteRecommendation[] {
  const recommendations = recommendBusinessOffers({
    eventType: request.eventType,
    message: request.message,
    guestCount: request.guestCount ?? 0,
    budgetCents: request.budgetCents,
    budgetPerPersonCents: request.budgetPerPersonCents,
    dietaryRequirements: request.dietaryRequirements,
    specialNeeds: request.specialNeeds,
    staffingNeeds: request.staffingNeeds,
    startTime: request.eventStartTime,
    endTime: request.eventEndTime,
    sameDayLabels: dayRequests.flatMap((entry) => entry.quote?.lines.map((line) => line.label) ?? []),
  });
  if (recommendations.length) return recommendations.map((recommendation) => ({
    id: recommendation.id,
    title: recommendation.familyName,
    quote: {
      template: recommendation.familyName.toLowerCase().includes("plateau") ? "plateau_repas" : recommendation.familyName.toLowerCase().includes("brunch") ? "brunch" : recommendation.familyName.toLowerCase().includes("buffet") ? "buffet_froid" : "cocktail",
      lines: [{ id: crypto.randomUUID(), label: recommendation.familyName, quantity: request.guestCount ?? 1, unitPriceCents: Math.round(recommendation.priceTtcPerPersonCents / 1.1), vatRate: 10, details: recommendation.composition }],
      included: "Prestation culinaire et composition détaillée ci-dessus.",
      excluded: "Livraison, boissons, vaisselle, personnel et installation sauf mention contraire.",
      logistics: "Adresse, accès et conditions de prestation à confirmer.",
      introduction: recommendation.summary,
    },
    totalTtcCents: recommendation.totalTtcCents,
    foodCostCents: recommendation.foodCostCents,
    foodCostSharePercent: recommendation.foodCostSharePercent,
    reasons: [...recommendation.reasons, ...recommendation.productionBaseNames.map((base) => `Base de production : ${base}.`), `Charge : ${recommendation.load.referenceCount} références, ${recommendation.load.activeMinutes} min actifs.`],
    warnings: recommendation.warnings,
    requiresManualApproval: recommendation.requiresManualApproval,
  }));
  const guestCount = request.guestCount;
  if (!guestCount || guestCount < 1) return [];

  const template = formatFor(request.eventType);
  const season = currentSeason(request.eventDate);
  const candidates: Candidate[] = catalog
    .filter((item) => item.active && matchesFormat(item, template))
    .filter((item) => guestCount >= item.minimumQuantity)
    .map((item) => {
      const line = lineFor(item, guestCount);
      return {
        item,
        template,
        totalTtcCents: totalTtc(line),
        seasonMatch:
          item.seasonality.some((value) => normalize(value) === "toute l'annee") ||
          item.seasonality.some((value) => normalize(value) === season),
      };
    })
    .sort((a, b) => a.totalTtcCents - b.totalTtcCents);
  if (!candidates.length) return [];

  const budget = request.budgetCents ?? request.budgetPerPersonCents! * guestCount;
  const closestToBudget = [...candidates].sort(
    (a, b) => Math.abs(a.totalTtcCents - budget) - Math.abs(b.totalTtcCents - budget),
  )[0];
  const selections = [closestToBudget, candidates[0], candidates.at(-1)!]
    .filter((candidate, index, all) => all.findIndex((entry) => entry.item.id === candidate.item.id) === index);
  const labels = ["Recommandée", "Essentielle", "Signature"];

  return selections.map((candidate, index) => {
    const line = lineFor(candidate.item, guestCount);
    const perPerson = Math.round(candidate.totalTtcCents / guestCount);
    const foodCostCents = candidate.item.foodCostCents === undefined
      ? undefined
      : candidate.item.foodCostCents * line.quantity;
    const foodCostSharePercent = foodCostCents === undefined
      ? undefined
      : Math.round((foodCostCents / (line.quantity * line.unitPriceCents)) * 100);
    const warnings = [
      ...dietaryWarnings(request, candidate.item),
      ...loadWarnings(request, candidate.item, dayRequests),
      ...eventWarnings(request, candidate),
    ];
    const requiresManualApproval =
      /allergie severe|anaphylax|traces|contamination croisee/.test(
        normalize(request.dietaryRequirements),
      ) ||
      guestCount > automaticCapacity(candidate.template, candidate.item) ||
      warnings.some((warning) => warning.includes("ne pas l'envoyer telle quelle"));
    if (guestCount > automaticCapacity(candidate.template, candidate.item))
      warnings.push(`Au-delà de ${automaticCapacity(candidate.template, candidate.item)} convives pour ce format, validation humaine de la capacité obligatoire.`);
    if (candidate.totalTtcCents > budget)
      warnings.push(`Dépasse le budget annoncé de ${Math.round((candidate.totalTtcCents - budget) / 100).toLocaleString("fr-FR")} € TTC.`);
    if (foodCostSharePercent !== undefined) {
      const target = candidate.template === "cocktail" ? 28 : candidate.template === "plateau_repas" ? 30 : 32;
      if (foodCostSharePercent > target)
        warnings.push(`Coût matière estimé à ${foodCostSharePercent} % du prix HT, au-dessus du repère provisoire de ${target} %.`);
    }
    const reasons = [
      `${candidate.item.name}, adapté au format « ${request.eventType || "événement"} ».`,
      `${(perPerson / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} TTC par personne.`,
      candidate.seasonMatch ? "Compatible avec la saison de l'événement." : "Hors saison indiquée : à confirmer avec le client.",
    ];
    return {
      id: `${candidate.item.id}-${labels[index] ?? "alternative"}`,
      title: labels[index] ?? "Alternative",
      quote: {
        template: candidate.template,
        lines: [line],
        included: "Prestation culinaire et composition détaillée ci-dessus.",
        excluded: "Livraison, boissons, vaisselle et personnel sauf mention contraire.",
        logistics: request.eventAddress ? "Livraison et conditions d'accès à confirmer." : "Adresse et logistique à confirmer.",
        introduction: `Proposition élaborée pour ${guestCount} convives, en tenant compte du format de votre événement.`,
      },
      totalTtcCents: candidate.totalTtcCents,
      foodCostCents,
      foodCostSharePercent,
      reasons,
      warnings,
      requiresManualApproval,
    };
  });
}
