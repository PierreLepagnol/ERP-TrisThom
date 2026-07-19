import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = process.argv[2];
const output = process.argv[3] ?? "src/domain/business-reference/reference.generated.ts";
if (!source) throw new Error("Usage: bun scripts/import-business-reference.ts <fichier.xlsx> [sortie.ts]");

const book = XLSX.readFile(source);
const normalized = (value: unknown) => String(value ?? "").replace(/œ|Œ/g, "oe").replace(/æ|Æ/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const slug = (value: unknown) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const list = (value: unknown) => String(value ?? "").split(/[,;/]/).map((item) => item.trim()).filter(Boolean);
const cents = (value: unknown) => Math.round(Number(value) * 100);
const rows = (sheet: string, headerRow: number) => {
  const values = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet], { header: 1, defval: "" });
  const headers = values[headerRow].map(String);
  return values.slice(headerRow + 1).filter((row) => row.some((cell) => String(cell).trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
};
const status = (value: unknown) => {
  const valueText = normalized(value);
  if (valueText.includes("exploitation reel")) return "real";
  if (valueText.includes("a tester")) return "to_test";
  return "estimated";
};
const yes = (value: unknown) => /oui/i.test(String(value));
const saleUnit = (value: unknown) => {
  const unit = normalized(value);
  if (unit.includes("plateau")) return "tray";
  if (unit.includes("planche")) return "board";
  if (unit.includes("litre")) return "liter";
  if (unit.includes("personne")) return "person";
  if (unit.includes("piece")) return "piece";
  if (unit.includes("portion")) return "portion";
  return "package";
};

const ids = new Set<string>();
const uniqueId = (name: unknown, category: unknown) => {
  const base = slug(name); const candidate = ids.has(base) ? `${base}-${slug(category)}` : base;
  if (ids.has(candidate)) throw new Error(`Duplicate catalog identifier: ${candidate}`);
  ids.add(candidate); return candidate;
};
const catalogItems = rows("Catalogue maître", 3).filter((row) => row.Article).map((row) => ({
  id: uniqueId(row.Article, row["Catégorie FT"]), name: String(row.Article), category: String(row["Catégorie FT"]), portionLabel: String(row["Portions / lot"]), saleUnit: saleUnit(row["Portions / lot"]),
  materialCostPerUnitCents: cents(row["Coût / portion"]), suggestedSalePriceHtCents: cents(row["Prix vente conseillé HT"]), estimatedMaterialMarginRate: Number(row["Marge matière %"]),
  compatibleOfferFamilyIds: list(row["Familles compatibles"]).map(slug), productionBaseIds: list(row["Base de production"]).map(slug),
  temperature: slug(row.Température) || "other", seasons: list(row.Saison), diets: list(row.Régimes), allergens: list(row.Allergènes),
  minimumQuantity: Number(row.Minimum) || undefined, productionMultiple: Number(row["Multiple prod."]) || undefined,
  difficulty: slug(row.Difficulté) || "unknown", activeTimeMinutes: Number(row["Temps actif min"]) || undefined,
  transportFragility: slug(row["Fragilité transport"]) || "unknown", dataStatus: status(row["Statut prix"]), active: yes(row.Actif), notes: String(row.Notes || "") || undefined,
}));
const offerFamilies = rows("Familles d'offres", 2).filter((row) => row["Famille d'offre"]).map((row) => ({ id: slug(row["Famille d'offre"]), name: String(row["Famille d'offre"]), customerNeed: String(row["Besoin client"]), configuration: String(row.Configuration), duration: String(row["Durée adaptée"]), budget: String(row["Budget indicatif TTC/pers."]), structure: String(row["Structure recommandée"]), constraints: String(row["Contraintes clés"]), alternatives: list(row["Alternatives possibles"]), priority: String(row["Priorité moteur"]) }));
const productionBases = rows("Bases de production", 2).filter((row) => row["Base de production"]).map((row) => ({ id: slug(row["Base de production"]), name: String(row["Base de production"]), compatiblePreparations: list(row["Préparations compatibles"]), commercialFamilies: list(row["Familles commerciales"]), allergens: list(row["Allergènes majeurs"]), diets: list(row.Régimes), seasons: list(row.Saisons), shareable: yes(row.Mutualisable), priority: String(row["Priorité mutualisation"]), notes: String(row["Notes de production"]) }));
const businessRules = rows("Règles & exclusions", 2).filter((row) => row.Priorité).map((row) => ({ priority: Number(row.Priorité), type: String(row["Type de règle"]), condition: String(row.Condition), action: String(row["Action du bot"]), blocks: yes(row["Blocage ?"]), requiresHuman: yes(row["Validation humaine ?"]), example: String(row.Exemple) }));
const testScenarios = rows("Scénarios de test", 2).filter((row) => row.ID).map((row) => ({ id: String(row.ID), request: String(row.Demande), guests: Number(row.Convives), budgetTtcPerPerson: Number(row["Budget TTC/pers."]), duration: String(row.Durée), configuration: String(row.Configuration), constraints: String(row.Contraintes), alternatives: [row["Alternative 1"], row["Alternative 2"], row["Alternative 3"]].filter(Boolean).map(String), expected: String(row["Recommandation attendue"]), why: String(row.Pourquoi), status: String(row["Statut test"]) }));
const offerCompositions = rows("Offres & compositions", 2).filter((row) => row.Type).map((row) => ({ type: String(row.Type), name: String(row["Nom de l'offre"]), publicPriceTtc: Number(row["Prix carte TTC"]), unit: String(row.Unité), structure: String(row["Composition / structure"]), usage: String(row["Usage conseillé"]), source: String(row.Source), status: String(row["Statut dans le bot"]), notes: String(row.Notes || "") || undefined }));
const services = rows("Services & options", 2).filter((row) => row["Service / option"]).map((row) => ({ id: slug(row["Service / option"]), name: String(row["Service / option"]), billingRule: String(row["Règle de facturation"]), trigger: String(row.Déclencheur), unit: String(row["Unité recommandée"]), requiredData: list(row["Données nécessaires"]), behavior: String(row["Bot : comportement"]), source: String(row.Source) }));
const policyRows = rows("Politique tarifaire", 3).filter((row) => row.Format);
const pricingPolicies = policyRows.filter((row) => Number(row["Prix TTC retenu"]) > 0).map((row) => ({ format: String(row.Format), publicPriceTtc: Number(row["Prix TTC retenu"]), structure: String(row.Structure || ""), positioning: String(row.Positionnement || ""), reason: String(row.Pourquoi || ""), targetMaterialCost: String(row["Coût matière cible"] || ""), rule: String(row["Règle bot"] || ""), excludedOptions: list(row["Options exclues"]) }));
const articleEstimationRules = policyRows.filter((row) => !Number(row["Prix TTC retenu"]) && row.Catégorie).map((row) => ({ category: String(row.Catégorie), targetMaterialCost: String(row["Coût matière cible"]), laborMarkup: String(row["Majoration main-d'œuvre"]), minimum: String(row["Minimum provisoire"]), multiple: String(row.Multiple), difficulty: String(row["Difficulté type"]), fragility: String(row["Fragilité type"]), notes: String(row.Commentaire) }));

const reference = { catalogItems, offerFamilies, productionBases, businessRules, testScenarios, offerCompositions, services, pricingPolicies, articleEstimationRules };
const destination = resolve(output);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `// Generated from ${source.replace(/\\/g, "/")}. Do not edit by hand.\nexport const businessReferenceData = ${JSON.stringify(reference, null, 2)} as const;\n`);
console.log(`Generated ${destination}: ${catalogItems.length} articles, ${offerFamilies.length} families, ${productionBases.length} bases.`);
