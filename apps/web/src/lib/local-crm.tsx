import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type RequestStatus = "nouveau" | "a_qualifier" | "qualifie" | "devis_a_preparer" | "devis_envoye" | "relance" | "accepte" | "refuse" | "annule";
export type RequestSource = "directus" | "email" | "telephone" | "1001traiteur" | "manuel";
export type LocalNote = { id: string; content: string; createdAt: number };
export type LocalHistoryEntry = { id: string; label: string; createdAt: number };
export type LocalQuoteLine = { id: string; label: string; quantity: number; unitPriceCents: number; vatRate: number };
export type LocalQuote = { status: "brouillon" | "pret" | "envoye"; discountCents: number; lines: LocalQuoteLine[]; updatedAt: number };
export type CatalogItem = { id: string; name: string; description: string; unit: string; unitPriceCents: number; vatRate: number; category: string; active: boolean };

export type LocalRequest = {
  _id: string; status: RequestStatus; source: RequestSource; contactName: string;
  contactEmail?: string; contactPhone?: string; organizationName?: string; eventType?: string;
  eventDate?: number; eventStartTime?: string; eventEndTime?: string; venue?: string; eventAddress?: string;
  guestCount?: number; budgetCents?: number; budgetPerPersonCents?: number; message?: string;
  specialNeeds?: string; dietaryRequirements?: string; staffingNeeds?: string;
  quote?: LocalQuote;
  missingInformation: string[]; quoteAmountCents?: number; nextActionAt?: number; acceptedAt?: number;
  handledAt?: number; notes: LocalNote[]; history: LocalHistoryEntry[]; createdAt: number; updatedAt: number;
};

type CreateRequestInput = Omit<LocalRequest, "_id" | "status" | "missingInformation" | "notes" | "history" | "createdAt" | "updatedAt">;
type EditableRequest = Partial<Omit<LocalRequest, "_id" | "notes" | "history" | "createdAt">>;
type LocalCrm = {
  requests: LocalRequest[];
  catalog: CatalogItem[];
  clients: Array<{ name: string; email?: string; phone?: string; organization?: string; requestCount: number; lastRequestAt: number }>;
  dashboard: { metrics: { activeRequests: number; quotesToPrepare: number; pipelineCents: number; conversionRate: number | null }; priorities: Array<{ _id: string; title: string; dueAt: number }>; upcomingEvents: LocalRequest[]; pipeline: Array<{ status: string; count: number }> };
  createRequest: (input: CreateRequestInput) => Promise<string>;
  updateStatus: (input: { requestId: string; status: RequestStatus; eventStartTime?: string; eventEndTime?: string }) => Promise<void>;
  updateRequest: (requestId: string, changes: EditableRequest) => Promise<void>;
  addNote: (requestId: string, content: string) => Promise<void>;
  markHandled: (requestId: string) => Promise<void>;
  startQuotePreparation: (requestId: string) => Promise<void>;
  saveQuote: (requestId: string, quote: LocalQuote) => Promise<void>;
  saveCatalogItem: (item: CatalogItem) => Promise<void>;
  deleteCatalogItem: (itemId: string) => Promise<void>;
};

const STORAGE_KEY = "tristhom.local.requests.v1";
const CATALOG_STORAGE_KEY = "tristhom.local.catalog.v1";
const LocalCrmContext = createContext<LocalCrm | null>(null);
const openStatuses: RequestStatus[] = ["nouveau", "a_qualifier", "qualifie", "devis_a_preparer", "devis_envoye", "relance"];
const id = (suffix: string) => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${suffix}-${Math.random()}`;

function readRequests() {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as LocalRequest[]).map((request) => ({ ...request, notes: request.notes ?? [], history: request.history ?? [] })); } catch { return []; }
}

function readCatalog() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(CATALOG_STORAGE_KEY) ?? "[]") as CatalogItem[]; } catch { return []; }
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
    const now = Date.now(); const request: LocalRequest = { ...input, _id: id("request"), contactName: input.contactName.trim() || "Contact à identifier", status: missingInformation(input).length ? "a_qualifier" : "nouveau", missingInformation: missingInformation(input), notes: [], history: [{ id: id("created"), label: "Demande reçue", createdAt: now }], createdAt: now, updatedAt: now };
    setRequests((current) => [request, ...current]); return request._id;
  }, []);

  const updateStatus = useCallback(async ({ requestId, status, eventStartTime, eventEndTime }: Parameters<LocalCrm["updateStatus"]>[0]) => {
    const request = requests.find((item) => item._id === requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (status === "accepte" && (!request.eventDate || !eventStartTime || !eventEndTime)) throw new Error("La date et les horaires sont obligatoires avant confirmation.");
    const now = Date.now();
    setRequests((current) => current.map((item) => item._id !== requestId ? item : { ...item, status, eventStartTime: eventStartTime ?? item.eventStartTime, eventEndTime: eventEndTime ?? item.eventEndTime, acceptedAt: status === "accepte" ? now : item.acceptedAt, nextActionAt: status === "devis_envoye" ? now + 3 * 86400000 : item.nextActionAt, history: [...item.history, { id: id("status"), label: `Statut modifié : ${status.replaceAll("_", " ")}`, createdAt: now }], updatedAt: now }));
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
      ...item, quote: { ...quote, updatedAt: now }, quoteAmountCents: Math.max(0, Math.round(totalCents)),
      history: [...item.history, { id: id("quote-save"), label: quote.status === "envoye" ? "Devis marqué comme envoyé" : "Brouillon de devis enregistré", createdAt: now }],
      nextActionAt: quote.status === "envoye" ? now + 3 * 86400000 : item.nextActionAt, updatedAt: now,
    }));
  }, []);
  const saveCatalogItem = useCallback(async (item: CatalogItem) => { setCatalog((current) => { const exists = current.some((entry) => entry.id === item.id); return exists ? current.map((entry) => entry.id === item.id ? item : entry) : [...current, item]; }); }, []);
  const deleteCatalogItem = useCallback(async (itemId: string) => { setCatalog((current) => current.filter((item) => item.id !== itemId)); }, []);

  const value = useMemo<LocalCrm>(() => {
    const now = Date.now(), active = requests.filter((request) => openStatuses.includes(request.status)), decided = requests.filter((request) => ["accepte", "refuse", "annule"].includes(request.status)), accepted = decided.filter((request) => request.status === "accepte");
    const clientMap = new Map<string, LocalCrm["clients"][number]>();
    for (const request of requests) { const key = request.contactEmail?.toLowerCase() ?? request.contactPhone ?? request.contactName.toLowerCase(), existing = clientMap.get(key); clientMap.set(key, { name: request.contactName, email: request.contactEmail ?? existing?.email, phone: request.contactPhone ?? existing?.phone, organization: request.organizationName ?? existing?.organization, requestCount: (existing?.requestCount ?? 0) + 1, lastRequestAt: Math.max(existing?.lastRequestAt ?? 0, request.createdAt) }); }
    return { requests, catalog, clients: [...clientMap.values()].sort((a, b) => b.lastRequestAt - a.lastRequestAt), createRequest, updateStatus, updateRequest, addNote, markHandled, startQuotePreparation, saveQuote, saveCatalogItem, deleteCatalogItem, dashboard: { metrics: { activeRequests: active.length, quotesToPrepare: requests.filter((request) => request.status === "devis_a_preparer").length, pipelineCents: active.reduce((total, request) => total + (request.quoteAmountCents ?? request.budgetCents ?? 0), 0), conversionRate: decided.length ? Math.round((accepted.length / decided.length) * 100) : null }, priorities: requests.filter((request) => request.nextActionAt && request.nextActionAt <= now + 7 * 86400000).map((request) => ({ _id: request._id, title: `Relancer ${request.contactName}`, dueAt: request.nextActionAt! })).sort((a, b) => a.dueAt - b.dueAt).slice(0, 6), upcomingEvents: requests.filter((request) => request.eventDate && request.eventDate >= now && request.status !== "annule").sort((a, b) => (a.eventDate ?? 0) - (b.eventDate ?? 0)).slice(0, 5), pipeline: openStatuses.map((status) => ({ status, count: requests.filter((request) => request.status === status).length })) } };
  }, [addNote, catalog, createRequest, deleteCatalogItem, markHandled, requests, saveCatalogItem, saveQuote, startQuotePreparation, updateRequest, updateStatus]);
  return <LocalCrmContext.Provider value={value}>{children}</LocalCrmContext.Provider>;
}

export function useLocalCrm() { const value = useContext(LocalCrmContext); if (!value) throw new Error("useLocalCrm doit être utilisé dans LocalCrmProvider"); return value; }
