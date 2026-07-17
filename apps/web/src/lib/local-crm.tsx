import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type RequestStatus = "nouveau" | "a_qualifier" | "qualifie" | "devis_a_preparer" | "devis_envoye" | "relance" | "accepte" | "refuse" | "annule";
export type RequestSource = "directus" | "email" | "telephone" | "1001traiteur" | "manuel";
export type LocalNote = { id: string; content: string; createdAt: number };
export type LocalHistoryEntry = { id: string; label: string; createdAt: number };
export type LocalFollowUp = { id: string; title: string; dueAt: number; completedAt?: number };
export type LocalQuoteLine = { id: string; label: string; quantity: number; unitPriceCents: number; vatRate: number; details?: string[] };
export type QuoteTemplate = "libre" | "cocktail" | "buffet_froid" | "buffet_chaud" | "mariage" | "plateau_repas" | "brunch";
export type LocalQuote = { number?: string; version: number; status: "brouillon" | "pret" | "envoye" | "accepte" | "refuse"; template: QuoteTemplate; issueDate: number; validUntil: number; depositPercent: number; included: string; excluded: string; logistics: string; discountCents: number; lines: LocalQuoteLine[]; updatedAt: number; versions: Array<{ version: number; savedAt: number; quote: Omit<LocalQuote, "versions"> }> };
export type CatalogItem = { id: string; name: string; description: string; details?: string[]; unit: string; unitPriceCents: number; vatRate: number; category: string; active: boolean; seasonality: string[]; dietary: string[]; allergens: string[]; minimumQuantity: number; productionMinutes: number; capacityPerDay: number; recommendedFor: string[] };

export type LocalRequest = {
  _id: string; status: RequestStatus; source: RequestSource; contactName: string;
  contactEmail?: string; contactPhone?: string; organizationName?: string; eventType?: string;
  eventDate?: number; eventStartTime?: string; eventEndTime?: string; venue?: string; eventAddress?: string;
  guestCount?: number; budgetCents?: number; budgetPerPersonCents?: number; message?: string;
  specialNeeds?: string; dietaryRequirements?: string; staffingNeeds?: string;
  quote?: LocalQuote;
  missingInformation: string[]; quoteAmountCents?: number; nextActionAt?: number; acceptedAt?: number;
  handledAt?: number; archivedAt?: number; followUps: LocalFollowUp[]; notes: LocalNote[]; history: LocalHistoryEntry[]; createdAt: number; updatedAt: number;
};

type CreateRequestInput = Omit<LocalRequest, "_id" | "status" | "missingInformation" | "notes" | "followUps" | "history" | "createdAt" | "updatedAt">;
type EditableRequest = Partial<Omit<LocalRequest, "_id" | "notes" | "history" | "createdAt">>;
type LocalCrm = {
  requests: LocalRequest[];
  catalog: CatalogItem[];
  clients: Array<{ name: string; email?: string; phone?: string; organization?: string; requestCount: number; lastRequestAt: number }>;
  dashboard: { metrics: { activeRequests: number; quotesToPrepare: number; pipelineCents: number; conversionRate: number | null }; priorities: Array<{ _id: string; requestId: string; title: string; dueAt: number; completedAt?: number }>; upcomingEvents: LocalRequest[]; monthRequests: LocalRequest[]; pipeline: Array<{ status: string; count: number }> };
  createRequest: (input: CreateRequestInput) => Promise<string>;
  updateStatus: (input: { requestId: string; status: RequestStatus; eventStartTime?: string; eventEndTime?: string }) => Promise<void>;
  updateRequest: (requestId: string, changes: EditableRequest) => Promise<void>;
  addNote: (requestId: string, content: string) => Promise<void>;
  markHandled: (requestId: string) => Promise<void>;
  startQuotePreparation: (requestId: string) => Promise<void>;
  saveQuote: (requestId: string, quote: LocalQuote) => Promise<void>;
  createQuoteVersion: (requestId: string, quote: LocalQuote) => Promise<LocalQuote>;
  saveCatalogItem: (item: CatalogItem) => Promise<void>;
  deleteCatalogItem: (itemId: string) => Promise<void>;
  completeFollowUp: (requestId: string, followUpId: string) => Promise<void>;
  archiveRequest: (requestId: string) => Promise<void>;
};

const STORAGE_KEY = "tristhom.local.requests.v1";
const CATALOG_STORAGE_KEY = "tristhom.local.catalog.v1";
const LocalCrmContext = createContext<LocalCrm | null>(null);
const openStatuses: RequestStatus[] = ["nouveau", "a_qualifier", "qualifie", "devis_a_preparer", "devis_envoye", "relance"];
const id = (suffix: string) => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${suffix}-${Math.random()}`;
const DEFAULT_CATALOG: CatalogItem[] = ([
  ["cocktail-comptoir", "Cocktail Comptoir", "8 pièces : 5 froides, 2 chaudes, 1 sucrée.", ["5 pièces froides au choix", "2 pièces chaudes au choix", "1 pièce sucrée au choix"], "personne", 2000, "Formules cocktail"],
  ["cocktail-brasserie", "Cocktail Brasserie", "12 pièces : 7 froides, 3 chaudes, 2 sucrées.", ["Froides : mini sandwich œuf mimosa, mini sandwich volaille estragon, tartelette tomate-chèvre, verrine lentilles, brochette tomate-mozzarella, blinis truite fumée, gaspacho en shot", "Chaudes : mini croque comté-jambon, assortiment de mini quiches, cromesquis façon bourguignon", "Sucrées : mini pain perdu, verrine riz au lait caramel"], "personne", 2455, "Formules cocktail"],
  ["cocktail-reception", "Cocktail Réception", "18 pièces, format premium pour réception travaillée.", ["10 pièces froides avec sélection premium", "5 pièces chaudes dont une pièce signature", "3 pièces sucrées maison"], "personne", 3455, "Formules cocktail"],
  ["buffet-comptoir", "Buffet Comptoir", "1 entrée, 1 plat et 1 dessert.", ["1 entrée ou salade composée", "1 plat froid ou chaud avec accompagnement", "1 dessert maison"], "personne", 1636, "Formules buffet"],
  ["buffet-brasserie", "Buffet Brasserie", "2 entrées, 1 plat et 2 desserts.", ["2 entrées au choix : tomates-burrata, terrine maison, betteraves rôties ou saumon gravlax", "1 plat au choix : volaille estragon, bœuf bourguignon, risotto légumes ou saumon", "1 accompagnement maison", "2 desserts maison"], "personne", 2273, "Formules buffet"],
  ["buffet-reception", "Buffet Réception", "3 entrées, 2 plats et 3 desserts.", ["3 entrées de saison", "2 plats au choix avec accompagnements", "3 desserts maison à partager"], "personne", 2909, "Formules buffet"],
  ["plateau-froid", "Plateau-repas froid", "Plateau individuel complet pour réunion ou séminaire.", "plateau", 1536, "Plateaux-repas"],
  ["plateau-chaud", "Plateau-repas chaud", "Plateau individuel, remise en température selon le lieu.", "plateau", 1627, "Plateaux-repas"],
  ["sandwich-mimosa", "Mini sandwich œuf mimosa & ciboulette", "Navette garnie, 20 pièces par fiche technique.", "pièce", 180, "Pièces froides"],
  ["sandwich-jambon", "Mini sandwich jambon-beurre & cornichon", "Navette garnie, 20 pièces par fiche technique.", "pièce", 220, "Pièces froides"],
  ["sandwich-vege", "Mini sandwich végétarien", "Houmous, légumes croquants et navette.", "pièce", 210, "Pièces froides"],
  ["sandwich-volaille", "Mini sandwich volaille à l’estragon", "Volaille rôtie, crème et estragon.", "pièce", 250, "Pièces froides"],
  ["sandwich-thon", "Mini sandwich rillettes de thon", "Rillettes maison et navette.", "pièce", 220, "Pièces froides"],
  ["sandwich-porc", "Mini sandwich rillettes de porc & pickles", "Rillettes maison, cornichons et navette.", "pièce", 180, "Pièces froides"],
  ["tartelette-chevre", "Tartelette tomate confite, chèvre & basilic", "Pièce froide végétarienne.", "pièce", 210, "Pièces froides"],
  ["blinis-truite", "Blinis crème citronnée & truite fumée", "Pièce froide premium.", "pièce", 250, "Pièces froides"],
  ["brochette-mozza", "Brochette tomate cerise, mozzarella & pistou", "Pièce froide végétarienne.", "pièce", 130, "Pièces froides"],
  ["verrine-lentilles", "Verrine lentilles vertes, légumes & herbes", "Verrine froide végétarienne.", "pièce", 170, "Pièces froides"],
  ["gaspacho", "Gaspacho en shot, huile d’herbes", "Shot froid de saison.", "pièce", 190, "Pièces froides"],
  ["verrine-crevette", "Verrine crevette, avocat & agrumes", "Verrine froide premium.", "pièce", 390, "Pièces froides"],
  ["tartare-boeuf", "Tartare de bœuf au couteau", "Pièce froide façon brasserie.", "pièce", 280, "Pièces froides"],
  ["tartare-saumon", "Tartare de saumon citron-aneth", "Pièce froide premium.", "pièce", 350, "Pièces froides"],
  ["croque", "Mini croque comté-jambon", "Pièce chaude, 20 pièces par fiche technique.", "pièce", 360, "Pièces chaudes"],
  ["quiche", "Assortiment de mini quiches", "Pièce chaude, recettes viande et légumes.", "pièce", 210, "Pièces chaudes"],
  ["feuillete-saucisse", "Feuilleté saucisse, moutarde à l’ancienne", "Pièce chaude de comptoir.", "pièce", 150, "Pièces chaudes"],
  ["accras", "Accras de cabillaud, crème citron", "Pièce chaude de la mer.", "pièce", 230, "Pièces chaudes"],
  ["cromesquis", "Cromesquis façon bourguignon", "Pièce chaude signature.", "pièce", 230, "Pièces chaudes"],
  ["bun-canard", "Bun de canard confit", "Pièce chaude premium.", "pièce", 340, "Pièces chaudes"],
  ["parmentier-canard", "Mini parmentier de canard", "Pièce chaude premium.", "pièce", 370, "Pièces chaudes"],
  ["saint-jacques", "Saint-Jacques, risotto & crème de corail", "Pièce chaude premium, sur demande.", "pièce", 550, "Pièces chaudes"],
  ["pain-perdu", "Mini pain perdu", "Pièce sucrée maison.", "pièce", 160, "Pièces sucrées"],
  ["compote", "Verrine compote pomme-poire-vanille", "Dessert individuel maison.", "pièce", 170, "Pièces sucrées"],
  ["brochette-fruits", "Brochette de fruits frais", "Dessert individuel de saison.", "pièce", 190, "Pièces sucrées"],
  ["planche-mixte", "Planche Mixte Comptoir", "Charcuteries, fromages, rillettes, dips et pain. Pour 10 personnes.", "planche", 4455, "Planches & apéritifs"],
  ["planche-vege", "Planche Végétarienne", "Cruditès, houmous, fromages et gressins. Pour 10 personnes.", "planche", 3273, "Planches & apéritifs"],
  ["livraison", "Livraison sur site", "Acheminement et créneau définis selon lieu.", "forfait", 3333, "Options & services"],
  ["vaisselle", "Vaisselle jetable qualitative", "Assiettes, couverts et serviettes.", "personne", 225, "Options & services"],
  ["mise-en-place", "Mise en place buffet", "Dressage du buffet sur place selon accès et timing.", "forfait", 10000, "Options & services"],
  ["service", "Personnel de service", "Personnel de salle pour la prestation.", "heure", 3000, "Options & services"],
] as Array<(string | number | string[])[]>).map((row) => { const [id, name, description, fourth, fifth, sixth, seventh] = row; const hasDetails = Array.isArray(fourth); const unit = hasDetails ? fifth : fourth; const unitPriceCents = hasDetails ? sixth : fifth; const category = hasDetails ? seventh : sixth; return enrichCatalogItem({ id: String(id), name: String(name), description: String(description), details: hasDetails ? fourth : undefined, unit: String(unit), unitPriceCents: Number(unitPriceCents), vatRate: category === "Options & services" ? 20 : 10, category: String(category), active: true }); });

function readRequests() {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as LocalRequest[]).map((request) => ({ ...request, notes: request.notes ?? [], history: request.history ?? [], followUps: request.followUps ?? [], quote: request.quote ? { ...request.quote, version: request.quote.version ?? 1, template: request.quote.template ?? "libre", issueDate: request.quote.issueDate ?? request.updatedAt, validUntil: request.quote.validUntil ?? request.updatedAt + 7 * 86400000, depositPercent: request.quote.depositPercent ?? 50, included: request.quote.included ?? "", excluded: request.quote.excluded ?? "", logistics: request.quote.logistics ?? "", versions: request.quote.versions ?? [] } : undefined })); } catch { return []; }
}

function readCatalog() {
  if (typeof window === "undefined") return [];
  try { const stored = JSON.parse(window.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "[]") as CatalogItem[]; if (!stored.length) return DEFAULT_CATALOG; const merged = stored.map((item) => { const reference = DEFAULT_CATALOG.find((entry) => entry.id === item.id); return enrichCatalogItem({ ...reference, ...item, details: item.details ?? reference?.details } as CatalogItem); }); const missing = DEFAULT_CATALOG.filter((reference) => !stored.some((item) => item.id === reference.id)); return [...merged, ...missing]; } catch { return DEFAULT_CATALOG; }
}

function enrichCatalogItem(item: Omit<CatalogItem, "seasonality" | "dietary" | "allergens" | "minimumQuantity" | "productionMinutes" | "capacityPerDay" | "recommendedFor"> & Partial<CatalogItem>): CatalogItem {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const seasonal = /tomate|gaspacho|fruits|burrata|courgette|poivron/.test(text) ? ["Printemps", "Été"] : /butternut|potimarron|oignon|bourguignon|gratin/.test(text) ? ["Automne", "Hiver"] : ["Toute l'année"];
  const vegetarian = /végét|tomate|mozzarella|lentilles|gaspacho|champignon|polenta|dessert|fruit|gaspacho|brunch/.test(text);
  const vegan = /gaspacho|lentilles|brochette de fruits/.test(text);
  const allergens = [ /gluten|sandwich|croque|quiche|tartelette|feuillet|bun|pain|plateau/.test(text) ? "Gluten" : "", /œuf|mimosa|quiche|mayo|croque/.test(text) ? "Œufs" : "", /fromage|comté|chèvre|mozzarella|crème|burrata|lait/.test(text) ? "Lait" : "", /saumon|truite|thon|crevette|cabillaud|saint-jacques/.test(text) ? "Poisson / crustacés" : "", /noix|pesto/.test(text) ? "Fruits à coque" : ""].filter(Boolean);
  const isPiece = item.unit === "pièce";
  return { ...item, seasonality: item.seasonality?.length ? item.seasonality : seasonal, dietary: item.dietary?.length ? item.dietary : vegan ? ["Vegan possible"] : vegetarian ? ["Végétarien"] : [], allergens: item.allergens?.length ? item.allergens : allergens, minimumQuantity: item.minimumQuantity ?? (isPiece ? 20 : item.unit === "personne" ? 10 : 1), productionMinutes: item.productionMinutes ?? (isPiece ? 45 : item.category.includes("Formules") ? 120 : item.category === "Options & services" ? 20 : 60), capacityPerDay: item.capacityPerDay ?? (isPiece ? 300 : item.unit === "personne" ? 120 : 20), recommendedFor: item.recommendedFor?.length ? item.recommendedFor : item.category.includes("cocktail") ? ["Afterwork", "Anniversaire", "Réception debout"] : item.category.includes("buffet") ? ["Déjeuner d'entreprise", "Réception familiale", "Mariage"] : ["Option de devis"] };
}

function missingInformation(input: Pick<LocalRequest, "contactEmail" | "contactPhone" | "eventDate" | "eventAddress" | "eventType" | "guestCount" | "eventStartTime" | "eventEndTime" | "budgetCents" | "dietaryRequirements">) {
  const missing: string[] = [];
  if (!input.contactEmail && !input.contactPhone) missing.push("Coordonnées du contact");
  if (!input.eventDate) missing.push("Date de l’événement");
  if (!input.eventAddress) missing.push("Adresse de l’événement");
  if (!input.eventType) missing.push("Format souhaité");
  if (!input.guestCount) missing.push("Nombre de personnes");
  if (!input.eventStartTime || !input.eventEndTime) missing.push("Horaires de l’événement");
  if (!input.budgetCents) missing.push("Budget");
  if (!input.dietaryRequirements) missing.push("Allergies et régimes alimentaires");
  return missing;
}

export function LocalCrmProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<LocalRequest[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  useEffect(() => { setRequests(readRequests()); setCatalog(readCatalog()); setStorageLoaded(true); }, []);
  useEffect(() => { if (storageLoaded) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests)); window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog)); } }, [catalog, requests, storageLoaded]);

  const createRequest = useCallback(async (input: CreateRequestInput) => {
    const now = Date.now(); const request: LocalRequest = { ...input, _id: id("request"), contactName: input.contactName.trim() || "Contact à identifier", status: missingInformation(input).length ? "a_qualifier" : "nouveau", missingInformation: missingInformation(input), notes: [], followUps: [], history: [{ id: id("created"), label: "Demande reçue", createdAt: now }], createdAt: now, updatedAt: now };
    setRequests((current) => [request, ...current]); return request._id;
  }, []);

  const updateStatus = useCallback(async ({ requestId, status, eventStartTime, eventEndTime }: Parameters<LocalCrm["updateStatus"]>[0]) => {
    const request = requests.find((item) => item._id === requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (status === "accepte" && (!request.eventDate || !eventStartTime || !eventEndTime)) throw new Error("La date et les horaires sont obligatoires avant confirmation.");
    const now = Date.now();
    setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, status, eventStartTime: eventStartTime ?? item.eventStartTime, eventEndTime: eventEndTime ?? item.eventEndTime, acceptedAt: status === "accepte" ? now : item.acceptedAt, nextActionAt: status === "devis_envoye" ? now + 3 * 86400000 : item.nextActionAt, followUps: status === "devis_envoye" && item.status !== "devis_envoye" ? [...item.followUps, { id: id("j3"), title: `Relancer ${item.contactName} (J+3)`, dueAt: now + 3 * 86400000 }, { id: id("j7"), title: `Relancer ${item.contactName} (J+7)`, dueAt: now + 7 * 86400000 }] : item.followUps, history: [...item.history, { id: id("status"), label: `Statut modifié : ${status.replaceAll("_", " ")}`, createdAt: now }], updatedAt: now }));
  }, [requests]);

  const updateRequest = useCallback(async (requestId: string, changes: EditableRequest) => {
    const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, ...changes, missingInformation: missingInformation({ ...item, ...changes }), history: [...item.history, { id: id("edited"), label: "Informations du dossier modifiées", createdAt: now }], updatedAt: now }));
  }, []);
  const addNote = useCallback(async (requestId: string, content: string) => { const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, notes: [...item.notes, { id: id("note"), content, createdAt: now }], history: [...item.history, { id: id("note-history"), label: "Note interne ajoutée", createdAt: now }], updatedAt: now })); }, []);
  const markHandled = useCallback(async (requestId: string) => { const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, handledAt: now, history: [...item.history, { id: id("handled"), label: "Demande marquée comme traitée", createdAt: now }], updatedAt: now })); }, []);
  const startQuotePreparation = useCallback(async (requestId: string) => { const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, status: "devis_a_preparer", history: [...item.history, { id: id("quote"), label: "Préparation du devis commencée", createdAt: now }], updatedAt: now })); }, []);
  const saveQuote = useCallback(async (requestId: string, quote: LocalQuote) => {
    const now = Date.now();
    const totalCents = quote.lines.reduce((total, line) => total + line.quantity * line.unitPriceCents * (1 + line.vatRate / 100), 0) - quote.discountCents;
    setRequests((current) => current.map((item) => item._id !== requestId ? item : {
      ...item, status: quote.status === "envoye" ? "devis_envoye" : item.status, quote: { ...quote, updatedAt: now }, quoteAmountCents: Math.max(0, Math.round(totalCents)), nextActionAt: quote.status === "envoye" ? now + 3 * 86400000 : item.nextActionAt, followUps: quote.status === "envoye" && item.status !== "devis_envoye" ? [...item.followUps, { id: id("quote-j3"), title: `Relancer ${item.contactName} (J+3)`, dueAt: now + 3 * 86400000 }, { id: id("quote-j7"), title: `Relancer ${item.contactName} (J+7)`, dueAt: now + 7 * 86400000 }] : item.followUps,
      history: [...item.history, { id: id("quote-save"), label: quote.status === "envoye" ? "Devis marqué comme envoyé" : "Brouillon de devis enregistré", createdAt: now }],
      updatedAt: now,
    }));
  }, []);
  const createQuoteVersion = useCallback(async (requestId: string, quote: LocalQuote) => {
    const now = Date.now(); const snapshot: Omit<LocalQuote, "versions"> = { ...quote, versions: undefined } as Omit<LocalQuote, "versions">;
    const next = { ...quote, version: quote.version + 1, status: "brouillon" as const, updatedAt: now, versions: [...quote.versions, { version: quote.version, savedAt: now, quote: snapshot }] };
    await saveQuote(requestId, next); return next;
  }, [saveQuote]);
  const saveCatalogItem = useCallback(async (item: CatalogItem) => { setCatalog((current) => { const exists = current.some((entry) => entry.id === item.id); return exists ? current.map((entry) => entry.id === item.id ? item : entry) : [...current, item]; }); }, []);
  const deleteCatalogItem = useCallback(async (itemId: string) => { setCatalog((current) => current.filter((item) => item.id !== itemId)); }, []);
  const completeFollowUp = useCallback(async (requestId: string, followUpId: string) => { const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, followUps: item.followUps.map((task) => task.id === followUpId ? { ...task, completedAt: now } : task), history: [...item.history, { id: id("followup"), label: "Relance marquée comme effectuée", createdAt: now }], updatedAt: now })); }, []);
  const archiveRequest = useCallback(async (requestId: string) => { const now = Date.now(); setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, archivedAt: now, history: [...item.history, { id: id("archive"), label: "Dossier archivé", createdAt: now }], updatedAt: now })); }, []);

  const value = useMemo<LocalCrm>(() => {
    const now = Date.now(), visibleRequests = requests.filter((request) => !request.archivedAt), active = visibleRequests.filter((request) => openStatuses.includes(request.status)), decided = visibleRequests.filter((request) => ["accepte", "refuse", "annule"].includes(request.status)), accepted = decided.filter((request) => request.status === "accepte");
    const clientMap = new Map<string, LocalCrm["clients"][number]>();
    for (const request of requests) { const key = request.contactEmail?.toLowerCase() ?? request.contactPhone ?? request.contactName.toLowerCase(), existing = clientMap.get(key); clientMap.set(key, { name: request.contactName, email: request.contactEmail ?? existing?.email, phone: request.contactPhone ?? existing?.phone, organization: request.organizationName ?? existing?.organization, requestCount: (existing?.requestCount ?? 0) + 1, lastRequestAt: Math.max(existing?.lastRequestAt ?? 0, request.createdAt) }); }
    return { requests: visibleRequests, catalog, clients: [...clientMap.values()].sort((a, b) => b.lastRequestAt - a.lastRequestAt), createRequest, updateStatus, updateRequest, addNote, markHandled, startQuotePreparation, saveQuote, createQuoteVersion, saveCatalogItem, deleteCatalogItem, completeFollowUp, archiveRequest, dashboard: { metrics: { activeRequests: active.length, quotesToPrepare: visibleRequests.filter((request) => request.status === "devis_a_preparer").length, pipelineCents: active.reduce((total, request) => total + (request.quoteAmountCents ?? request.budgetCents ?? 0), 0), conversionRate: decided.length ? Math.round((accepted.length / decided.length) * 100) : null }, priorities: visibleRequests.flatMap((request) => request.followUps.filter((task) => !task.completedAt && task.dueAt <= now + 7 * 86400000).map((task) => ({ _id: task.id, requestId: request._id, title: task.title, dueAt: task.dueAt, completedAt: task.completedAt }))).sort((a, b) => a.dueAt - b.dueAt).slice(0, 8), upcomingEvents: visibleRequests.filter((request) => request.eventDate && request.eventDate >= now && request.status !== "annule").sort((a, b) => (a.eventDate ?? 0) - (b.eventDate ?? 0)).slice(0, 5), monthRequests: visibleRequests.filter((request) => request.eventDate), pipeline: openStatuses.map((status) => ({ status, count: visibleRequests.filter((request) => request.status === status).length })) } };
  }, [addNote, archiveRequest, catalog, completeFollowUp, createQuoteVersion, createRequest, deleteCatalogItem, markHandled, requests, saveCatalogItem, saveQuote, startQuotePreparation, updateRequest, updateStatus]);
  return <LocalCrmContext.Provider value={value}>{children}</LocalCrmContext.Provider>;
}

export function useLocalCrm() { const value = useContext(LocalCrmContext); if (!value) throw new Error("useLocalCrm doit être utilisé dans LocalCrmProvider"); return value; }
