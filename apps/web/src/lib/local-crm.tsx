import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type RequestStatus =
  | "nouveau"
  | "a_qualifier"
  | "devis_a_preparer"
  | "devis_envoye"
  | "relance"
  | "accepte"
  | "refuse"
  | "annule";

export type RequestSource = "directus" | "email" | "telephone" | "1001traiteur" | "manuel";

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
  message?: string;
  missingInformation: string[];
  quoteAmountCents?: number;
  nextActionAt?: number;
  acceptedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type CreateRequestInput = Omit<
  LocalRequest,
  "_id" | "status" | "missingInformation" | "createdAt" | "updatedAt"
>;

type LocalCrm = {
  requests: LocalRequest[];
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
    priorities: Array<{ _id: string; title: string; dueAt: number }>;
    upcomingEvents: LocalRequest[];
    pipeline: Array<{ status: string; count: number }>;
  };
  createRequest: (input: CreateRequestInput) => Promise<string>;
  updateStatus: (input: {
    requestId: string;
    status: RequestStatus;
    eventStartTime?: string;
    eventEndTime?: string;
  }) => Promise<void>;
};

const STORAGE_KEY = "tristhom.local.requests.v1";
const LocalCrmContext = createContext<LocalCrm | null>(null);
const openStatuses: RequestStatus[] = ["nouveau", "a_qualifier", "devis_a_preparer", "devis_envoye", "relance"];

function readRequests() {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as LocalRequest[]) : [];
  } catch {
    return [];
  }
}

function missingInformation(input: CreateRequestInput) {
  const missing: string[] = [];
  if (!input.contactEmail && !input.contactPhone) missing.push("Coordonnées du contact");
  if (!input.eventDate) missing.push("Date de l’événement");
  if (!input.eventAddress) missing.push("Adresse de l’événement");
  if (!input.eventType) missing.push("Format souhaité");
  if (!input.guestCount) missing.push("Nombre de personnes");
  return missing;
}

export function LocalCrmProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<LocalRequest[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    setRequests(readRequests());
    setStorageLoaded(true);
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    } catch {
      // Some private browser contexts disable storage. The app still remains
      // usable for the current tab in that case.
    }
  }, [requests, storageLoaded]);

  const createRequest = useCallback(async (input: CreateRequestInput) => {
    const now = Date.now();
    const missing = missingInformation(input);
    const request: LocalRequest = {
      ...input,
      _id: globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random()}`,
      contactName: input.contactName.trim() || "Contact à identifier",
      status: missing.length > 0 ? "a_qualifier" : "nouveau",
      missingInformation: missing,
      createdAt: now,
      updatedAt: now,
    };
    setRequests((current) => [request, ...current]);
    return request._id;
  }, []);

  const updateStatus = useCallback(async ({ requestId, status, eventStartTime, eventEndTime }: Parameters<LocalCrm["updateStatus"]>[0]) => {
    const request = requests.find((item) => item._id === requestId);
    if (!request) throw new Error("Demande introuvable.");
    if (status === "accepte" && (!request.eventDate || !eventStartTime || !eventEndTime)) {
      throw new Error("La date et les horaires sont obligatoires avant confirmation.");
    }
    const now = Date.now();
    setRequests((current) => current.map((item) => item._id === requestId ? {
      ...item,
      status,
      eventStartTime: eventStartTime ?? item.eventStartTime,
      eventEndTime: eventEndTime ?? item.eventEndTime,
      acceptedAt: status === "accepte" ? now : item.acceptedAt,
      nextActionAt: status === "devis_envoye" ? now + 3 * 24 * 60 * 60 * 1000 : item.nextActionAt,
      updatedAt: now,
    } : item));
  }, [requests]);

  const value = useMemo<LocalCrm>(() => {
    const now = Date.now();
    const active = requests.filter((request) => openStatuses.includes(request.status));
    const decided = requests.filter((request) => ["accepte", "refuse", "annule"].includes(request.status));
    const accepted = decided.filter((request) => request.status === "accepte");
    const clientMap = new Map<string, LocalCrm["clients"][number]>();
    for (const request of requests) {
      const key = request.contactEmail?.toLowerCase() ?? request.contactPhone ?? request.contactName.toLowerCase();
      const existing = clientMap.get(key);
      clientMap.set(key, {
        name: request.contactName,
        email: request.contactEmail ?? existing?.email,
        phone: request.contactPhone ?? existing?.phone,
        organization: request.organizationName ?? existing?.organization,
        requestCount: (existing?.requestCount ?? 0) + 1,
        lastRequestAt: Math.max(existing?.lastRequestAt ?? 0, request.createdAt),
      });
    }

    return {
      requests,
      clients: [...clientMap.values()].sort((a, b) => b.lastRequestAt - a.lastRequestAt),
      createRequest,
      updateStatus,
      dashboard: {
        metrics: {
          activeRequests: active.length,
          quotesToPrepare: requests.filter((request) => request.status === "devis_a_preparer").length,
          pipelineCents: active.reduce((total, request) => total + (request.quoteAmountCents ?? request.budgetCents ?? 0), 0),
          conversionRate: decided.length === 0 ? null : Math.round((accepted.length / decided.length) * 100),
        },
        priorities: requests
          .filter((request) => request.nextActionAt && request.nextActionAt <= now + 7 * 24 * 60 * 60 * 1000)
          .map((request) => ({ _id: request._id, title: `Relancer ${request.contactName}`, dueAt: request.nextActionAt! }))
          .sort((a, b) => a.dueAt - b.dueAt)
          .slice(0, 6),
        upcomingEvents: requests
          .filter((request) => request.eventDate && request.eventDate >= now && request.status !== "annule")
          .sort((a, b) => (a.eventDate ?? 0) - (b.eventDate ?? 0))
          .slice(0, 5),
        pipeline: openStatuses.map((status) => ({ status, count: requests.filter((request) => request.status === status).length })),
      },
    };
  }, [createRequest, requests, updateStatus]);

  return <LocalCrmContext.Provider value={value}>{children}</LocalCrmContext.Provider>;
}

export function useLocalCrm() {
  const value = useContext(LocalCrmContext);
  if (!value) throw new Error("useLocalCrm doit être utilisé dans LocalCrmProvider");
  return value;
}
