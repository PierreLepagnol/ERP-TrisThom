import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createDemoRequests } from "@/data/demo-crm-data";
import { getMissingQualificationInformation } from "@/domain/request-qualification";
import {
  activeRequestStatuses,
  getAllowedRequestStatuses,
  type RequestStatus,
} from "@/domain/request-status";

export type { RequestStatus } from "@/domain/request-status";
export type RequestSource =
  | "directus"
  | "email"
  | "telephone"
  | "1001traiteur"
  | "manuel";
export type LocalNote = { id: string; content: string; createdAt: number };
export type LocalHistoryEntry = {
  id: string;
  label: string;
  createdAt: number;
};
export type LocalFollowUp = {
  id: string;
  title: string;
  dueAt: number;
  completedAt?: number;
};
export type LocalQuoteLine = {
  id: string;
  label: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  details?: string[];
};
export type QuoteTemplate =
  | "libre"
  | "cocktail"
  | "buffet_froid"
  | "buffet_chaud"
  | "mariage"
  | "plateau_repas"
  | "brunch";
export type LocalQuote = {
  number?: string;
  version: number;
  status: "brouillon" | "pret" | "envoye" | "accepte" | "refuse";
  template: QuoteTemplate;
  issueDate: number;
  validUntil: number;
  depositPercent: number;
  included: string;
  excluded: string;
  logistics: string;
  introduction?: string;
  conditions?: string;
  remarks?: string;
  discountCents: number;
  lines: LocalQuoteLine[];
  updatedAt: number;
  versions: Array<{
    version: number;
    savedAt: number;
    quote: Omit<LocalQuote, "versions">;
  }>;
};
export type QuoteVersion = {
  id: string;
  versionNumber: number;
  status: LocalQuote["status"];
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  revisionReason?: string;
  lines: LocalQuoteLine[];
  discountCents: number;
  issueDate: number;
  validUntil: number;
  depositPercent: number;
  included: string;
  excluded: string;
  logistics: string;
  introduction?: string;
  conditions?: string;
  remarks?: string;
  template: QuoteTemplate;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
};
export type Quote = {
  id: string;
  requestId: string;
  quoteNumber: string;
  currentVersionId: string;
  status: LocalQuote["status"];
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  acceptedAt?: number;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  versions: QuoteVersion[];
};
export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  details?: string[];
  unit: string;
  unitPriceCents: number;
  vatRate: number;
  category: string;
  active: boolean;
  seasonality: string[];
  dietary: string[];
  allergens: string[];
  minimumQuantity: number;
  productionMinutes: number;
  capacityPerDay: number;
  recommendedFor: string[];
};

export type LocalRequest = {
  _id: string;
  status: RequestStatus;
  source: RequestSource;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  eventType?: string;
  eventDate?: number;
  eventStartTime?: string;
  eventEndTime?: string;
  venue?: string;
  eventAddress?: string;
  guestCount?: number;
  budgetCents?: number;
  budgetPerPersonCents?: number;
  message?: string;
  specialNeeds?: string;
  dietaryRequirements?: string;
  staffingNeeds?: string;
  quote?: LocalQuote;
  missingInformation: string[];
  quoteAmountCents?: number;
  nextActionAt?: number;
  acceptedAt?: number;
  handledAt?: number;
  archivedAt?: number;
  followUps: LocalFollowUp[];
  notes: LocalNote[];
  history: LocalHistoryEntry[];
  createdAt: number;
  updatedAt: number;
};

type CreateRequestInput = Omit<
  LocalRequest,
  | "_id"
  | "status"
  | "missingInformation"
  | "notes"
  | "followUps"
  | "history"
  | "createdAt"
  | "updatedAt"
>;
type EditableRequest = Partial<
  Omit<LocalRequest, "_id" | "notes" | "history" | "createdAt">
>;
type LocalCrm = {
  requests: LocalRequest[];
  archivedRequests: LocalRequest[];
  quotes: Quote[];
  catalog: CatalogItem[];
  clients: Array<{
    name: string;
    email?: string;
    phone?: string;
    organization?: string;
    requestCount: number;
    lastRequestAt: number;
  }>;
  dashboard: {
    metrics: {
      activeRequests: number;
      quotesToPrepare: number;
      pipelineCents: number;
      conversionRate: number | null;
    };
    priorities: Array<{
      _id: string;
      requestId: string;
      title: string;
      dueAt: number;
      completedAt?: number;
    }>;
    upcomingEvents: LocalRequest[];
    monthRequests: LocalRequest[];
    pipeline: Array<{ status: RequestStatus; count: number }>;
  };
  createRequest: (input: CreateRequestInput) => Promise<string>;
  updateStatus: (input: {
    requestId: string;
    status: RequestStatus;
    eventStartTime?: string;
    eventEndTime?: string;
  }) => Promise<void>;
  qualifyRequest: (requestId: string) => Promise<void>;
  updateRequest: (requestId: string, changes: EditableRequest) => Promise<void>;
  addNote: (requestId: string, content: string) => Promise<void>;
  markHandled: (requestId: string) => Promise<void>;
  startQuotePreparation: (requestId: string) => Promise<void>;
  markQuoteSent: (requestId: string) => Promise<void>;
  scheduleFollowUp: (requestId: string, dueAt: number) => Promise<void>;
  confirmService: (requestId: string) => Promise<void>;
  closeRequest: (
    requestId: string,
    status: "refuse" | "annule",
    reason: string,
  ) => Promise<void>;
  saveQuote: (requestId: string, quote: LocalQuote) => Promise<void>;
  createQuoteVersion: (
    requestId: string,
    quote: LocalQuote,
  ) => Promise<LocalQuote>;
  restoreQuoteVersion: (
    requestId: string,
    versionId: string,
  ) => Promise<LocalQuote>;
  saveCatalogItem: (item: CatalogItem) => Promise<void>;
  deleteCatalogItem: (itemId: string) => Promise<void>;
  completeFollowUp: (requestId: string, followUpId: string) => Promise<void>;
  archiveRequest: (requestId: string) => Promise<void>;
  restoreRequest: (requestId: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
};

const STORAGE_KEY = "tristhom.local.requests.v1";
const CATALOG_STORAGE_KEY = "tristhom.local.catalog.v1";
const QUOTES_STORAGE_KEY = "tristhom.local.quotes.v1";
const LocalCrmContext = createContext<LocalCrm | null>(null);
const id = (suffix: string) =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${suffix}-${Math.random()}`;
const DEFAULT_CATALOG: CatalogItem[] = (
  [
    [
      "cocktail-comptoir",
      "Cocktail Comptoir",
      "8 pièces : 5 froides, 2 chaudes, 1 sucrée.",
      [
        "5 pièces froides au choix",
        "2 pièces chaudes au choix",
        "1 pièce sucrée au choix",
      ],
      "personne",
      2000,
      "Formules cocktail",
    ],
    [
      "cocktail-brasserie",
      "Cocktail Brasserie",
      "12 pièces : 7 froides, 3 chaudes, 2 sucrées.",
      [
        "Froides : mini sandwich œuf mimosa, mini sandwich volaille estragon, tartelette tomate-chèvre, verrine lentilles, brochette tomate-mozzarella, blinis truite fumée, gaspacho en shot",
        "Chaudes : mini croque comté-jambon, assortiment de mini quiches, cromesquis façon bourguignon",
        "Sucrées : mini pain perdu, verrine riz au lait caramel",
      ],
      "personne",
      2455,
      "Formules cocktail",
    ],
    [
      "cocktail-reception",
      "Cocktail Réception",
      "18 pièces, format premium pour réception travaillée.",
      [
        "10 pièces froides avec sélection premium",
        "5 pièces chaudes dont une pièce signature",
        "3 pièces sucrées maison",
      ],
      "personne",
      3455,
      "Formules cocktail",
    ],
    [
      "buffet-comptoir",
      "Buffet Comptoir",
      "1 entrée, 1 plat et 1 dessert.",
      [
        "1 entrée ou salade composée",
        "1 plat froid ou chaud avec accompagnement",
        "1 dessert maison",
      ],
      "personne",
      1636,
      "Formules buffet",
    ],
    [
      "buffet-brasserie",
      "Buffet Brasserie",
      "2 entrées, 1 plat et 2 desserts.",
      [
        "2 entrées au choix : tomates-burrata, terrine maison, betteraves rôties ou saumon gravlax",
        "1 plat au choix : volaille estragon, bœuf bourguignon, risotto légumes ou saumon",
        "1 accompagnement maison",
        "2 desserts maison",
      ],
      "personne",
      2273,
      "Formules buffet",
    ],
    [
      "buffet-reception",
      "Buffet Réception",
      "3 entrées, 2 plats et 3 desserts.",
      [
        "3 entrées de saison",
        "2 plats au choix avec accompagnements",
        "3 desserts maison à partager",
      ],
      "personne",
      2909,
      "Formules buffet",
    ],
    [
      "plateau-froid",
      "Plateau-repas froid",
      "Plateau individuel complet pour réunion ou séminaire.",
      "plateau",
      1536,
      "Plateaux-repas",
    ],
    [
      "plateau-chaud",
      "Plateau-repas chaud",
      "Plateau individuel, remise en température selon le lieu.",
      "plateau",
      1627,
      "Plateaux-repas",
    ],
    [
      "sandwich-mimosa",
      "Mini sandwich œuf mimosa & ciboulette",
      "Navette garnie, 20 pièces par fiche technique.",
      "pièce",
      180,
      "Pièces froides",
    ],
    [
      "sandwich-jambon",
      "Mini sandwich jambon-beurre & cornichon",
      "Navette garnie, 20 pièces par fiche technique.",
      "pièce",
      220,
      "Pièces froides",
    ],
    [
      "sandwich-vege",
      "Mini sandwich végétarien",
      "Houmous, légumes croquants et navette.",
      "pièce",
      210,
      "Pièces froides",
    ],
    [
      "sandwich-volaille",
      "Mini sandwich volaille à l’estragon",
      "Volaille rôtie, crème et estragon.",
      "pièce",
      250,
      "Pièces froides",
    ],
    [
      "sandwich-thon",
      "Mini sandwich rillettes de thon",
      "Rillettes maison et navette.",
      "pièce",
      220,
      "Pièces froides",
    ],
    [
      "sandwich-porc",
      "Mini sandwich rillettes de porc & pickles",
      "Rillettes maison, cornichons et navette.",
      "pièce",
      180,
      "Pièces froides",
    ],
    [
      "tartelette-chevre",
      "Tartelette tomate confite, chèvre & basilic",
      "Pièce froide végétarienne.",
      "pièce",
      210,
      "Pièces froides",
    ],
    [
      "blinis-truite",
      "Blinis crème citronnée & truite fumée",
      "Pièce froide premium.",
      "pièce",
      250,
      "Pièces froides",
    ],
    [
      "brochette-mozza",
      "Brochette tomate cerise, mozzarella & pistou",
      "Pièce froide végétarienne.",
      "pièce",
      130,
      "Pièces froides",
    ],
    [
      "verrine-lentilles",
      "Verrine lentilles vertes, légumes & herbes",
      "Verrine froide végétarienne.",
      "pièce",
      170,
      "Pièces froides",
    ],
    [
      "gaspacho",
      "Gaspacho en shot, huile d’herbes",
      "Shot froid de saison.",
      "pièce",
      190,
      "Pièces froides",
    ],
    [
      "verrine-crevette",
      "Verrine crevette, avocat & agrumes",
      "Verrine froide premium.",
      "pièce",
      390,
      "Pièces froides",
    ],
    [
      "tartare-boeuf",
      "Tartare de bœuf au couteau",
      "Pièce froide façon brasserie.",
      "pièce",
      280,
      "Pièces froides",
    ],
    [
      "tartare-saumon",
      "Tartare de saumon citron-aneth",
      "Pièce froide premium.",
      "pièce",
      350,
      "Pièces froides",
    ],
    [
      "croque",
      "Mini croque comté-jambon",
      "Pièce chaude, 20 pièces par fiche technique.",
      "pièce",
      360,
      "Pièces chaudes",
    ],
    [
      "quiche",
      "Assortiment de mini quiches",
      "Pièce chaude, recettes viande et légumes.",
      "pièce",
      210,
      "Pièces chaudes",
    ],
    [
      "feuillete-saucisse",
      "Feuilleté saucisse, moutarde à l’ancienne",
      "Pièce chaude de comptoir.",
      "pièce",
      150,
      "Pièces chaudes",
    ],
    [
      "accras",
      "Accras de cabillaud, crème citron",
      "Pièce chaude de la mer.",
      "pièce",
      230,
      "Pièces chaudes",
    ],
    [
      "cromesquis",
      "Cromesquis façon bourguignon",
      "Pièce chaude signature.",
      "pièce",
      230,
      "Pièces chaudes",
    ],
    [
      "bun-canard",
      "Bun de canard confit",
      "Pièce chaude premium.",
      "pièce",
      340,
      "Pièces chaudes",
    ],
    [
      "parmentier-canard",
      "Mini parmentier de canard",
      "Pièce chaude premium.",
      "pièce",
      370,
      "Pièces chaudes",
    ],
    [
      "saint-jacques",
      "Saint-Jacques, risotto & crème de corail",
      "Pièce chaude premium, sur demande.",
      "pièce",
      550,
      "Pièces chaudes",
    ],
    [
      "pain-perdu",
      "Mini pain perdu",
      "Pièce sucrée maison.",
      "pièce",
      160,
      "Pièces sucrées",
    ],
    [
      "compote",
      "Verrine compote pomme-poire-vanille",
      "Dessert individuel maison.",
      "pièce",
      170,
      "Pièces sucrées",
    ],
    [
      "brochette-fruits",
      "Brochette de fruits frais",
      "Dessert individuel de saison.",
      "pièce",
      190,
      "Pièces sucrées",
    ],
    [
      "planche-mixte",
      "Planche Mixte Comptoir",
      "Charcuteries, fromages, rillettes, dips et pain. Pour 10 personnes.",
      "planche",
      4455,
      "Planches & apéritifs",
    ],
    [
      "planche-vege",
      "Planche Végétarienne",
      "Cruditès, houmous, fromages et gressins. Pour 10 personnes.",
      "planche",
      3273,
      "Planches & apéritifs",
    ],
    [
      "livraison",
      "Livraison sur site",
      "Acheminement et créneau définis selon lieu.",
      "forfait",
      3333,
      "Options & services",
    ],
    [
      "vaisselle",
      "Vaisselle jetable qualitative",
      "Assiettes, couverts et serviettes.",
      "personne",
      225,
      "Options & services",
    ],
    [
      "mise-en-place",
      "Mise en place buffet",
      "Dressage du buffet sur place selon accès et timing.",
      "forfait",
      10000,
      "Options & services",
    ],
    [
      "service",
      "Personnel de service",
      "Personnel de salle pour la prestation.",
      "heure",
      3000,
      "Options & services",
    ],
  ] as Array<(string | number | string[])[]>
).map((row) => {
  const [id, name, description, fourth, fifth, sixth, seventh] = row;
  const hasDetails = Array.isArray(fourth);
  const unit = hasDetails ? fifth : fourth;
  const unitPriceCents = hasDetails ? sixth : fifth;
  const category = hasDetails ? seventh : sixth;
  return enrichCatalogItem({
    id: String(id),
    name: String(name),
    description: String(description),
    details: hasDetails ? fourth : undefined,
    unit: String(unit),
    unitPriceCents: Number(unitPriceCents),
    vatRate: category === "Options & services" ? 20 : 10,
    category: String(category),
    active: true,
  });
});

const cloneDefaultCatalog = () =>
  DEFAULT_CATALOG.map((item) => ({
    ...item,
    details: item.details ? [...item.details] : undefined,
    seasonality: [...item.seasonality],
    dietary: [...item.dietary],
    allergens: [...item.allergens],
    recommendedFor: [...item.recommendedFor],
  }));

function calculateQuoteTotals(lines: LocalQuoteLine[], discountCents: number) {
  const rawHtCents = lines.reduce(
    (total, line) => total + line.quantity * line.unitPriceCents,
    0,
  );
  const rawTtcCents = lines.reduce(
    (total, line) =>
      total + line.quantity * line.unitPriceCents * (1 + line.vatRate / 100),
    0,
  );
  const totalHtCents = Math.max(0, Math.round(rawHtCents - discountCents));
  const totalTtcCents = Math.max(0, Math.round(rawTtcCents - discountCents));
  return {
    totalHtCents,
    totalVatCents: Math.max(0, totalTtcCents - totalHtCents),
    totalTtcCents,
  };
}

function quoteVersionFromLegacy(
  quote: Omit<LocalQuote, "versions">,
  versionNumber: number,
  createdAt: number,
  idValue: string | undefined = id("quote-version"),
): QuoteVersion {
  return {
    id: idValue ?? id("quote-version"),
    versionNumber,
    status: quote.status,
    createdAt,
    updatedAt: quote.updatedAt ?? createdAt,
    lines: quote.lines ?? [],
    discountCents: quote.discountCents ?? 0,
    issueDate: quote.issueDate ?? createdAt,
    validUntil: quote.validUntil ?? createdAt + 7 * 86400000,
    depositPercent: quote.depositPercent ?? 50,
    included: quote.included ?? "",
    excluded: quote.excluded ?? "",
    logistics: quote.logistics ?? "",
    introduction: quote.introduction,
    conditions: quote.conditions,
    remarks: quote.remarks,
    template: quote.template ?? "libre",
    ...calculateQuoteTotals(quote.lines ?? [], quote.discountCents ?? 0),
  };
}

export function legacyQuoteFromVersion(
  version: QuoteVersion,
  versions: QuoteVersion[],
  quoteNumber: string,
): LocalQuote {
  return {
    number: quoteNumber,
    version: version.versionNumber,
    status: version.status,
    template: version.template,
    issueDate: version.issueDate,
    validUntil: version.validUntil,
    depositPercent: version.depositPercent,
    included: version.included,
    excluded: version.excluded,
    logistics: version.logistics,
    introduction: version.introduction,
    conditions: version.conditions,
    remarks: version.remarks,
    discountCents: version.discountCents,
    lines: version.lines,
    updatedAt: version.updatedAt,
    versions: versions
      .filter((item) => item.id !== version.id)
      .map((item) => ({
        version: item.versionNumber,
        savedAt: item.updatedAt,
        quote: legacyQuoteFromVersion(item, [], quoteNumber),
      })),
  };
}

function currentQuoteVersion(quote: Quote) {
  return (
    quote.versions.find((version) => version.id === quote.currentVersionId) ??
    quote.versions.at(-1)
  );
}

function migrateLegacyQuotes(requests: LocalRequest[]): Quote[] {
  return requests.flatMap((request) => {
    if (!request.quote) return [];
    const legacy = request.quote;
    const createdAt =
      legacy.updatedAt ?? request.updatedAt ?? request.createdAt;
    const historical = (legacy.versions ?? []).map((snapshot) =>
      quoteVersionFromLegacy(
        snapshot.quote,
        snapshot.version,
        snapshot.savedAt,
      ),
    );
    const current = quoteVersionFromLegacy(
      legacy,
      legacy.version ?? 1,
      createdAt,
    );
    const versions = [...historical, current].sort(
      (a, b) => a.versionNumber - b.versionNumber,
    );
    const totals = calculateQuoteTotals(
      legacy.lines ?? [],
      legacy.discountCents ?? 0,
    );
    return [
      {
        id: `migrated-${request._id}`,
        requestId: request._id,
        quoteNumber:
          legacy.number ??
          `D-${new Date(createdAt).getFullYear()}-${request._id.slice(0, 4).toUpperCase()}`,
        currentVersionId: current.id,
        status: legacy.status,
        createdAt,
        updatedAt: legacy.updatedAt ?? createdAt,
        sentAt: legacy.status === "envoye" ? legacy.updatedAt : undefined,
        acceptedAt: legacy.status === "accepte" ? legacy.updatedAt : undefined,
        ...totals,
        versions,
      },
    ];
  });
}

function readQuotes(requests: LocalRequest[]) {
  if (typeof window === "undefined") return [] as Quote[];
  try {
    const stored = window.localStorage.getItem(QUOTES_STORAGE_KEY);
    const quotes = stored ? (JSON.parse(stored) as Quote[]) : [];
    const knownRequestIds = new Set(quotes.map((quote) => quote.requestId));
    return [
      ...quotes,
      ...migrateLegacyQuotes(requests).filter(
        (quote) => !knownRequestIds.has(quote.requestId),
      ),
    ];
  } catch {
    return migrateLegacyQuotes(requests);
  }
}

function readRequests() {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return createDemoRequests();
  try {
    return (JSON.parse(stored) as LocalRequest[]).map((request) => ({
      ...request,
      missingInformation: missingInformation(request),
      notes: request.notes ?? [],
      history: request.history ?? [],
      followUps: request.followUps ?? [],
      quote: request.quote
        ? {
            ...request.quote,
            version: request.quote.version ?? 1,
            template: request.quote.template ?? "libre",
            issueDate: request.quote.issueDate ?? request.updatedAt,
            validUntil:
              request.quote.validUntil ?? request.updatedAt + 7 * 86400000,
            depositPercent: request.quote.depositPercent ?? 50,
            included: request.quote.included ?? "",
            excluded: request.quote.excluded ?? "",
            logistics: request.quote.logistics ?? "",
            versions: request.quote.versions ?? [],
          }
        : undefined,
    }));
  } catch {
    return [];
  }
}

function readCatalog() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "[]",
    ) as CatalogItem[];
    if (!stored.length) return cloneDefaultCatalog();
    const merged = stored.map((item) => {
      const reference = DEFAULT_CATALOG.find((entry) => entry.id === item.id);
      return enrichCatalogItem({
        ...reference,
        ...item,
        details: item.details ?? reference?.details,
      } as CatalogItem);
    });
    const missing = DEFAULT_CATALOG.filter(
      (reference) => !stored.some((item) => item.id === reference.id),
    );
    return [...merged, ...missing];
  } catch {
    return cloneDefaultCatalog();
  }
}

function enrichCatalogItem(
  item: Omit<
    CatalogItem,
    | "seasonality"
    | "dietary"
    | "allergens"
    | "minimumQuantity"
    | "productionMinutes"
    | "capacityPerDay"
    | "recommendedFor"
  > &
    Partial<CatalogItem>,
): CatalogItem {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const seasonal = /tomate|gaspacho|fruits|burrata|courgette|poivron/.test(text)
    ? ["Printemps", "Été"]
    : /butternut|potimarron|oignon|bourguignon|gratin/.test(text)
      ? ["Automne", "Hiver"]
      : ["Toute l'année"];
  const vegetarian =
    /végét|tomate|mozzarella|lentilles|gaspacho|champignon|polenta|dessert|fruit|gaspacho|brunch/.test(
      text,
    );
  const vegan = /gaspacho|lentilles|brochette de fruits/.test(text);
  const allergens = [
    /gluten|sandwich|croque|quiche|tartelette|feuillet|bun|pain|plateau/.test(
      text,
    )
      ? "Gluten"
      : "",
    /œuf|mimosa|quiche|mayo|croque/.test(text) ? "Œufs" : "",
    /fromage|comté|chèvre|mozzarella|crème|burrata|lait/.test(text)
      ? "Lait"
      : "",
    /saumon|truite|thon|crevette|cabillaud|saint-jacques/.test(text)
      ? "Poisson / crustacés"
      : "",
    /noix|pesto/.test(text) ? "Fruits à coque" : "",
  ].filter(Boolean);
  const isPiece = item.unit === "pièce";
  return {
    ...item,
    seasonality: item.seasonality?.length ? item.seasonality : seasonal,
    dietary: item.dietary?.length
      ? item.dietary
      : vegan
        ? ["Vegan possible"]
        : vegetarian
          ? ["Végétarien"]
          : [],
    allergens: item.allergens?.length ? item.allergens : allergens,
    minimumQuantity:
      item.minimumQuantity ??
      (isPiece ? 20 : item.unit === "personne" ? 10 : 1),
    productionMinutes:
      item.productionMinutes ??
      (isPiece
        ? 45
        : item.category.includes("Formules")
          ? 120
          : item.category === "Options & services"
            ? 20
            : 60),
    capacityPerDay:
      item.capacityPerDay ??
      (isPiece ? 300 : item.unit === "personne" ? 120 : 20),
    recommendedFor: item.recommendedFor?.length
      ? item.recommendedFor
      : item.category.includes("cocktail")
        ? ["Afterwork", "Anniversaire", "Réception debout"]
        : item.category.includes("buffet")
          ? ["Déjeuner d'entreprise", "Réception familiale", "Mariage"]
          : ["Option de devis"],
  };
}

function missingInformation(
  input: Pick<
    LocalRequest,
    | "contactEmail"
    | "contactPhone"
    | "eventDate"
    | "eventAddress"
    | "venue"
    | "eventType"
    | "guestCount"
    | "eventStartTime"
    | "eventEndTime"
    | "budgetCents"
    | "budgetPerPersonCents"
    | "dietaryRequirements"
    | "specialNeeds"
    | "staffingNeeds"
  >,
) {
  return getMissingQualificationInformation(input);
}

export function LocalCrmProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<LocalRequest[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  useEffect(() => {
    const loadedRequests = readRequests();
    setRequests(loadedRequests);
    setQuotes(readQuotes(loadedRequests));
    setCatalog(readCatalog());
    setStorageLoaded(true);
  }, []);
  useEffect(() => {
    if (storageLoaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
      window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
      window.localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
    }
  }, [catalog, quotes, requests, storageLoaded]);

  const createRequest = useCallback(async (input: CreateRequestInput) => {
    const now = Date.now();
    const request: LocalRequest = {
      ...input,
      _id: id("request"),
      contactName: input.contactName.trim() || "Contact à identifier",
      status: missingInformation(input).length ? "a_qualifier" : "nouveau",
      missingInformation: missingInformation(input),
      notes: [],
      followUps: [],
      history: [{ id: id("created"), label: "Demande reçue", createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    setRequests((current) => [request, ...current]);
    return request._id;
  }, []);

  const updateStatus = useCallback(
    async ({
      requestId,
      status,
      eventStartTime,
      eventEndTime,
    }: Parameters<LocalCrm["updateStatus"]>[0]) => {
      const request = requests.find((item) => item._id === requestId);
      if (!request) throw new Error("Demande introuvable.");
      if (
        request.status !== status &&
        !getAllowedRequestStatuses(request.status).includes(status)
      ) {
        throw new Error("Cette transition de statut n’est pas autorisée.");
      }
      if (
        status === "accepte" &&
        (!request.eventDate || !eventStartTime || !eventEndTime)
      )
        throw new Error(
          "La date et les horaires sont obligatoires avant confirmation.",
        );
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status,
                eventStartTime: eventStartTime ?? item.eventStartTime,
                eventEndTime: eventEndTime ?? item.eventEndTime,
                acceptedAt: status === "accepte" ? now : item.acceptedAt,
                nextActionAt:
                  status === "devis_envoye"
                    ? now + 3 * 86400000
                    : item.nextActionAt,
                followUps:
                  status === "devis_envoye" && item.status !== "devis_envoye"
                    ? [
                        ...item.followUps,
                        {
                          id: id("j3"),
                          title: `Relancer ${item.contactName} (J+3)`,
                          dueAt: now + 3 * 86400000,
                        },
                        {
                          id: id("j7"),
                          title: `Relancer ${item.contactName} (J+7)`,
                          dueAt: now + 7 * 86400000,
                        },
                      ]
                    : item.followUps,
                history: [
                  ...item.history,
                  {
                    id: id("status"),
                    label: `Statut modifié : ${status.replaceAll("_", " ")}`,
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [requests],
  );

  const qualifyRequest = useCallback(
    async (requestId: string) => {
      const request = requests.find((item) => item._id === requestId);
      if (!request) throw new Error("Demande introuvable.");
      const missing = missingInformation(request);
      if (missing.length)
        throw new Error(`À compléter : ${missing.join(", ")}`);
      if (request.status === "qualifie") return;
      if (!getAllowedRequestStatuses(request.status).includes("qualifie"))
        throw new Error(
          "La demande ne peut pas être qualifiée depuis son statut actuel.",
        );
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status: "qualifie",
                missingInformation: missing,
                history: [
                  ...item.history,
                  {
                    id: id("qualified"),
                    label: "Demande qualifiée",
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [requests],
  );

  const updateRequest = useCallback(
    async (requestId: string, changes: EditableRequest) => {
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                ...changes,
                missingInformation: missingInformation({ ...item, ...changes }),
                history: [
                  ...item.history,
                  {
                    id: id("edited"),
                    label: "Informations du dossier modifiées",
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [],
  );
  const addNote = useCallback(async (requestId: string, content: string) => {
    const now = Date.now();
    setRequests((current) =>
      current.map((item) =>
        item._id !== requestId
          ? item
          : {
              ...item,
              notes: [
                ...item.notes,
                { id: id("note"), content, createdAt: now },
              ],
              history: [
                ...item.history,
                {
                  id: id("note-history"),
                  label: "Note interne ajoutée",
                  createdAt: now,
                },
              ],
              updatedAt: now,
            },
      ),
    );
  }, []);
  const markHandled = useCallback(async (requestId: string) => {
    const now = Date.now();
    setRequests((current) =>
      current.map((item) =>
        item._id !== requestId
          ? item
          : {
              ...item,
              handledAt: now,
              history: [
                ...item.history,
                {
                  id: id("handled"),
                  label: "Demande marquée comme traitée",
                  createdAt: now,
                },
              ],
              updatedAt: now,
            },
      ),
    );
  }, []);
  const startQuotePreparation = useCallback(
    async (requestId: string) => {
      const request = requests.find((item) => item._id === requestId);
      if (!request) throw new Error("Demande introuvable.");
      const missing = missingInformation(request);
      if (missing.length)
        throw new Error(`À compléter : ${missing.join(", ")}`);
      if (
        request.status !== "devis_a_preparer" &&
        !getAllowedRequestStatuses(request.status).includes("devis_a_preparer")
      )
        throw new Error(
          "La demande doit être qualifiée avant la préparation du devis.",
        );
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status: "devis_a_preparer",
                missingInformation: missing,
                history:
                  item.status === "devis_a_preparer"
                    ? item.history
                    : [
                        ...item.history,
                        {
                          id: id("quote"),
                          label: "Préparation du devis commencée",
                          createdAt: now,
                        },
                      ],
                updatedAt: now,
              },
        ),
      );
    },
    [requests],
  );
  const markQuoteSent = useCallback(
    async (requestId: string) => {
      const request = requests.find((item) => item._id === requestId);
      const quote = quotes.find((item) => item.requestId === requestId);
      const version = quote && currentQuoteVersion(quote);
      if (!request || !quote || !version)
        throw new Error("Aucun devis ne peut être envoyé pour ce dossier.");
      if (
        request.status !== "devis_a_preparer" &&
        !getAllowedRequestStatuses(request.status).includes("devis_envoye")
      )
        throw new Error("Le devis ne peut pas être envoyé depuis ce statut.");
      const now = Date.now();
      const day = 86400000;
      setQuotes((current) =>
        current.map((item) =>
          item.id !== quote.id
            ? item
            : {
                ...item,
                status: "envoye",
                sentAt: now,
                updatedAt: now,
                versions: item.versions.map((entry) =>
                  entry.id === version.id
                    ? {
                        ...entry,
                        status: "envoye",
                        sentAt: now,
                        updatedAt: now,
                      }
                    : entry,
                ),
              },
        ),
      );
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status: "devis_envoye",
                quote: item.quote
                  ? { ...item.quote, status: "envoye", updatedAt: now }
                  : item.quote,
                quoteAmountCents: quote.totalTtcCents,
                nextActionAt: now + 3 * day,
                followUps: item.followUps.some((task) => !task.completedAt)
                  ? item.followUps
                  : [
                      ...item.followUps,
                      {
                        id: id("j3"),
                        title: `Relancer ${item.contactName} après le devis`,
                        dueAt: now + 3 * day,
                      },
                      {
                        id: id("j7"),
                        title: `Relancer ${item.contactName} après le devis`,
                        dueAt: now + 7 * day,
                      },
                    ],
                history: [
                  ...item.history,
                  {
                    id: id("quote-sent"),
                    label: `Devis ${item.quote?.number ?? ""} marqué comme envoyé`,
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [quotes, requests],
  );
  const scheduleFollowUp = useCallback(
    async (requestId: string, dueAt: number) => {
      const request = requests.find((item) => item._id === requestId);
      if (!request) throw new Error("Demande introuvable.");
      if (
        request.status !== "relance" &&
        !getAllowedRequestStatuses(request.status).includes("relance")
      )
        throw new Error(
          "Une relance ne peut être programmée qu’après l’envoi du devis.",
        );
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status: "relance",
                nextActionAt: dueAt,
                followUps: [
                  ...item.followUps,
                  {
                    id: id("manual-followup"),
                    title: `Relancer ${item.contactName}`,
                    dueAt,
                  },
                ],
                history: [
                  ...item.history,
                  {
                    id: id("followup-planned"),
                    label: `Relance programmée le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(dueAt)}`,
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [requests],
  );
  const confirmService = useCallback(
    async (requestId: string) => {
      const request = requests.find((item) => item._id === requestId);
      const quote = quotes.find((item) => item.requestId === requestId);
      const version = quote && currentQuoteVersion(quote);
      if (!request || !quote || !version)
        throw new Error(
          "Un devis est nécessaire avant de confirmer la prestation.",
        );
      if (
        !request.eventDate ||
        !request.eventStartTime ||
        !request.eventEndTime
      )
        throw new Error(
          "La date et les horaires sont obligatoires avant confirmation.",
        );
      if (
        request.status !== "accepte" &&
        !getAllowedRequestStatuses(request.status).includes("accepte")
      )
        throw new Error(
          "La prestation ne peut pas être confirmée depuis ce statut.",
        );
      const now = Date.now();
      setQuotes((current) =>
        current.map((item) =>
          item.id !== quote.id
            ? item
            : {
                ...item,
                status: "accepte",
                acceptedAt: now,
                updatedAt: now,
                versions: item.versions.map((entry) =>
                  entry.id === version.id
                    ? { ...entry, status: "accepte", updatedAt: now }
                    : entry,
                ),
              },
        ),
      );
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status: "accepte",
                acceptedAt: now,
                handledAt: now,
                quote: item.quote
                  ? { ...item.quote, status: "accepte", updatedAt: now }
                  : item.quote,
                quoteAmountCents: quote.totalTtcCents,
                history: [
                  ...item.history,
                  {
                    id: id("confirmed"),
                    label: "Prestation confirmée après acceptation du devis",
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [quotes, requests],
  );
  const closeRequest = useCallback(
    async (requestId: string, status: "refuse" | "annule", reason: string) => {
      const request = requests.find((item) => item._id === requestId);
      if (!request) throw new Error("Demande introuvable.");
      if (!getAllowedRequestStatuses(request.status).includes(status))
        throw new Error(
          "Cette clôture n’est pas autorisée depuis le statut actuel.",
        );
      const trimmedReason = reason.trim();
      if (!trimmedReason) throw new Error("Un motif est obligatoire.");
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status,
                notes: [
                  ...item.notes,
                  {
                    id: id("closure-note"),
                    content: `${status === "refuse" ? "Refus" : "Annulation"} : ${trimmedReason}`,
                    createdAt: now,
                  },
                ],
                history: [
                  ...item.history,
                  {
                    id: id("closed"),
                    label: `${status === "refuse" ? "Demande refusée" : "Demande annulée"} : ${trimmedReason}`,
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [requests],
  );
  const saveQuote = useCallback(
    async (requestId: string, quote: LocalQuote) => {
      const now = Date.now();
      const existing = quotes.find((item) => item.requestId === requestId);
      const current = existing && currentQuoteVersion(existing);
      const version = quoteVersionFromLegacy(
        quote,
        current?.versionNumber ?? quote.version ?? 1,
        current?.createdAt ?? now,
        current?.id,
      );
      const totals = calculateQuoteTotals(version.lines, version.discountCents);
      const sentAt = quote.status === "envoye" ? existing?.sentAt ?? now : existing?.sentAt;
      const storedQuote: Quote = existing
        ? {
            ...existing,
            status: quote.status,
            sentAt,
            updatedAt: now,
            ...totals,
            versions: existing.versions.map((entry) =>
              entry.id === version.id ? { ...version, updatedAt: now, sentAt: quote.status === "envoye" ? now : entry.sentAt } : entry,
            ),
          }
        : {
            id: id("quote"),
            requestId,
            quoteNumber:
              quote.number ??
              `D-${new Date(now).getFullYear()}-${String(quotes.length + 1).padStart(3, "0")}`,
            currentVersionId: version.id,
            status: quote.status,
            sentAt,
            createdAt: now,
            updatedAt: now,
            ...totals,
            versions: [{ ...version, updatedAt: now, sentAt }],
          };
      setQuotes((currentQuotes) =>
        existing
          ? currentQuotes.map((item) =>
              item.id === existing.id ? storedQuote : item,
            )
          : [...currentQuotes, storedQuote],
      );
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                status:
                  quote.status === "envoye" ? "devis_envoye" : item.status,
                quote: {
                  ...quote,
                  number: storedQuote.quoteNumber,
                  updatedAt: now,
                },
                quoteAmountCents: storedQuote.totalTtcCents,
                nextActionAt:
                  quote.status === "envoye"
                    ? now + 3 * 86400000
                    : item.nextActionAt,
                followUps:
                  quote.status === "envoye" && item.status !== "devis_envoye"
                    ? [
                        ...item.followUps,
                        {
                          id: id("quote-j3"),
                          title: `Relancer ${item.contactName} (J+3)`,
                          dueAt: now + 3 * 86400000,
                        },
                        {
                          id: id("quote-j7"),
                          title: `Relancer ${item.contactName} (J+7)`,
                          dueAt: now + 7 * 86400000,
                        },
                      ]
                    : item.followUps,
                history: [
                  ...item.history,
                  {
                    id: id("quote-save"),
                    label:
                      quote.status === "envoye"
                        ? "Devis marqué comme envoyé"
                        : "Brouillon de devis enregistré",
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [quotes],
  );
  const createQuoteVersion = useCallback(
    async (requestId: string, quote: LocalQuote) => {
      const now = Date.now();
      const storedQuote = quotes.find((item) => item.requestId === requestId);
      if (!storedQuote) {
        const next = {
          ...quote,
          version: 1,
          status: "brouillon" as const,
          updatedAt: now,
        };
        await saveQuote(requestId, next);
        return next;
      }
      const nextVersion = quoteVersionFromLegacy(
        { ...quote, status: "brouillon", updatedAt: now },
        Math.max(...storedQuote.versions.map((item) => item.versionNumber)) + 1,
        now,
      );
      const totals = calculateQuoteTotals(
        nextVersion.lines,
        nextVersion.discountCents,
      );
      const nextQuote = {
        ...storedQuote,
        currentVersionId: nextVersion.id,
        status: "brouillon" as const,
        sentAt: undefined,
        acceptedAt: undefined,
        updatedAt: now,
        ...totals,
        versions: [...storedQuote.versions, nextVersion],
      };
      setQuotes((current) =>
        current.map((item) => (item.id === storedQuote.id ? nextQuote : item)),
      );
      const next = legacyQuoteFromVersion(
        nextVersion,
        nextQuote.versions,
        nextQuote.quoteNumber,
      );
      setRequests((current) =>
        current.map((item) =>
          item._id === requestId
            ? {
                ...item,
                quote: next,
                quoteAmountCents: nextQuote.totalTtcCents,
                updatedAt: now,
                history: [
                  ...item.history,
                  {
                    id: id("quote-version"),
                    label: `Nouvelle version du devis ${nextQuote.quoteNumber} créée`,
                    createdAt: now,
                  },
                ],
              }
            : item,
        ),
      );
      return next;
    },
    [quotes, saveQuote],
  );
  const restoreQuoteVersion = useCallback(
    async (requestId: string, versionId: string) => {
      const quote = quotes.find((item) => item.requestId === requestId);
      const source = quote?.versions.find((item) => item.id === versionId);
      if (!quote || !source) throw new Error("Version de devis introuvable.");
      return createQuoteVersion(
        requestId,
        legacyQuoteFromVersion(source, quote.versions, quote.quoteNumber),
      );
    },
    [createQuoteVersion, quotes],
  );
  const saveCatalogItem = useCallback(async (item: CatalogItem) => {
    setCatalog((current) => {
      const exists = current.some((entry) => entry.id === item.id);
      return exists
        ? current.map((entry) => (entry.id === item.id ? item : entry))
        : [...current, item];
    });
  }, []);
  const deleteCatalogItem = useCallback(async (itemId: string) => {
    setCatalog((current) => current.filter((item) => item.id !== itemId));
  }, []);
  const completeFollowUp = useCallback(
    async (requestId: string, followUpId: string) => {
      const now = Date.now();
      setRequests((current) =>
        current.map((item) =>
          item._id !== requestId
            ? item
            : {
                ...item,
                followUps: item.followUps.map((task) =>
                  task.id === followUpId ? { ...task, completedAt: now } : task,
                ),
                history: [
                  ...item.history,
                  {
                    id: id("followup"),
                    label: "Relance marquée comme effectuée",
                    createdAt: now,
                  },
                ],
                updatedAt: now,
              },
        ),
      );
    },
    [],
  );
  const archiveRequest = useCallback(async (requestId: string) => {
    const now = Date.now();
    setRequests((current) =>
      current.map((item) =>
        item._id !== requestId
          ? item
          : {
              ...item,
              archivedAt: now,
              history: [
                ...item.history,
                { id: id("archive"), label: "Dossier archivé", createdAt: now },
              ],
              updatedAt: now,
            },
      ),
    );
  }, []);
  const restoreRequest = useCallback(async (requestId: string) => {
    const now = Date.now();
    setRequests((current) =>
      current.map((item) =>
        item._id !== requestId
          ? item
          : {
              ...item,
              archivedAt: undefined,
              history: [
                ...item.history,
                {
                  id: id("restore"),
                  label: "Dossier désarchivé",
                  createdAt: now,
                },
              ],
              updatedAt: now,
            },
      ),
    );
  }, []);
  const resetDemoData = useCallback(async () => {
    const demoRequests = createDemoRequests();
    const demoCatalog = cloneDefaultCatalog();
    const demoQuotes = migrateLegacyQuotes(demoRequests);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoRequests));
    window.localStorage.setItem(
      CATALOG_STORAGE_KEY,
      JSON.stringify(demoCatalog),
    );
    window.localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(demoQuotes));
    setRequests(demoRequests);
    setQuotes(demoQuotes);
    setCatalog(demoCatalog);
  }, []);

  const value = useMemo<LocalCrm>(() => {
    const now = Date.now(),
      visibleRequests = requests.filter((request) => !request.archivedAt),
      archivedRequests = requests.filter((request) => request.archivedAt),
      active = visibleRequests.filter((request) =>
        activeRequestStatuses.includes(request.status),
      ),
      decided = visibleRequests.filter((request) =>
        ["accepte", "refuse", "annule"].includes(request.status),
      ),
      accepted = decided.filter((request) => request.status === "accepte");
    const clientMap = new Map<string, LocalCrm["clients"][number]>();
    for (const request of requests) {
      const key =
          request.contactEmail?.toLowerCase() ??
          request.contactPhone ??
          request.contactName.toLowerCase(),
        existing = clientMap.get(key);
      clientMap.set(key, {
        name: request.contactName,
        email: request.contactEmail ?? existing?.email,
        phone: request.contactPhone ?? existing?.phone,
        organization: request.organizationName ?? existing?.organization,
        requestCount: (existing?.requestCount ?? 0) + 1,
        lastRequestAt: Math.max(
          existing?.lastRequestAt ?? 0,
          request.createdAt,
        ),
      });
    }
    return {
      requests: visibleRequests,
      archivedRequests,
      quotes,
      catalog,
      clients: [...clientMap.values()].sort(
        (a, b) => b.lastRequestAt - a.lastRequestAt,
      ),
      createRequest,
      updateStatus,
      qualifyRequest,
      updateRequest,
      addNote,
      markHandled,
      startQuotePreparation,
      markQuoteSent,
      scheduleFollowUp,
      confirmService,
      closeRequest,
      saveQuote,
      createQuoteVersion,
      restoreQuoteVersion,
      saveCatalogItem,
      deleteCatalogItem,
      completeFollowUp,
      archiveRequest,
      restoreRequest,
      resetDemoData,
      dashboard: {
        metrics: {
          activeRequests: active.length,
          quotesToPrepare: visibleRequests.filter(
            (request) => request.status === "devis_a_preparer",
          ).length,
          pipelineCents: active.reduce((total, request) => {
            const quote = quotes.find((item) => item.requestId === request._id);
            return total + (quote?.totalTtcCents ?? request.budgetCents ?? 0);
          }, 0),
          conversionRate: decided.length
            ? Math.round((accepted.length / decided.length) * 100)
            : null,
        },
        priorities: visibleRequests
          .flatMap((request) =>
            request.followUps
              .filter(
                (task) => !task.completedAt && task.dueAt <= now + 7 * 86400000,
              )
              .map((task) => ({
                _id: task.id,
                requestId: request._id,
                title: task.title,
                dueAt: task.dueAt,
                completedAt: task.completedAt,
              })),
          )
          .sort((a, b) => a.dueAt - b.dueAt)
          .slice(0, 8),
        upcomingEvents: visibleRequests
          .filter(
            (request) =>
              request.eventDate &&
              request.eventDate >= now &&
              request.status !== "annule",
          )
          .sort((a, b) => (a.eventDate ?? 0) - (b.eventDate ?? 0))
          .slice(0, 5),
        monthRequests: visibleRequests.filter((request) => request.eventDate),
        pipeline: activeRequestStatuses.map((status) => ({
          status,
          count: visibleRequests.filter((request) => request.status === status)
            .length,
        })),
      },
    };
  }, [
    addNote,
    archiveRequest,
    catalog,
    closeRequest,
    completeFollowUp,
    confirmService,
    createQuoteVersion,
    createRequest,
    deleteCatalogItem,
    markHandled,
    markQuoteSent,
    qualifyRequest,
    quotes,
    requests,
    resetDemoData,
    restoreRequest,
    restoreQuoteVersion,
    saveCatalogItem,
    saveQuote,
    scheduleFollowUp,
    startQuotePreparation,
    updateRequest,
    updateStatus,
  ]);
  return (
    <LocalCrmContext.Provider value={value}>
      {children}
    </LocalCrmContext.Provider>
  );
}

export function useLocalCrm() {
  const value = useContext(LocalCrmContext);
  if (!value)
    throw new Error("useLocalCrm doit être utilisé dans LocalCrmProvider");
  return value;
}
