export const requestStatusValues = ["nouveau", "a_qualifier", "qualifie", "devis_a_preparer", "devis_envoye", "relance", "accepte", "termine", "refuse", "annule"] as const;
export const commercialStatusValues = ["nouveau", "devis_a_preparer", "devis_envoye", "accepte", "termine", "refuse", "annule"] as const;
export type RequestStatus = (typeof requestStatusValues)[number];
export type CommercialStatus = (typeof commercialStatusValues)[number];
export type RequestStatusCategory = "active" | "won" | "lost" | "historical";
export type RequestStatusConfig = { value: RequestStatus; label: string; description: string; order: number; category: RequestStatusCategory; badgeClassName: string; calendarClassName: string; allowedTransitions: RequestStatus[] };

const config: Record<CommercialStatus, Omit<RequestStatusConfig, "value" | "allowedTransitions">> = {
  nouveau: { label: "Nouveau", description: "Nouvelle demande.", order: 1, category: "active", badgeClassName: "bg-sky-50 text-sky-800 ring-sky-100", calendarClassName: "bg-sky-100 text-sky-900 hover:bg-sky-200" },
  devis_a_preparer: { label: "Devis à préparer", description: "Proposition à préparer.", order: 2, category: "active", badgeClassName: "bg-orange-50 text-orange-900 ring-orange-100", calendarClassName: "bg-orange-100 text-orange-900 hover:bg-orange-200" },
  devis_envoye: { label: "En attente client", description: "En attente du retour client.", order: 3, category: "active", badgeClassName: "bg-blue-50 text-blue-800 ring-blue-100", calendarClassName: "bg-blue-100 text-blue-900 hover:bg-blue-200" },
  accepte: { label: "Confirmé", description: "Prestation confirmée.", order: 4, category: "won", badgeClassName: "bg-emerald-50 text-emerald-800 ring-emerald-100", calendarClassName: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200" },
  termine: { label: "Terminé", description: "Prestation terminée.", order: 5, category: "historical", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200" },
  refuse: { label: "Perdu", description: "Proposition non retenue.", order: 6, category: "historical", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200" },
  annule: { label: "Annulé", description: "Dossier annulé.", order: 7, category: "historical", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200" },
};

export function normalizeRequestStatus(status: RequestStatus): CommercialStatus {
  if (status === "a_qualifier") return "nouveau";
  if (status === "qualifie") return "devis_a_preparer";
  if (status === "relance") return "devis_envoye";
  return status;
}

export const requestStatusConfig: Record<RequestStatus, RequestStatusConfig> = Object.fromEntries(requestStatusValues.map((status) => [status, { ...config[normalizeRequestStatus(status)], value: status, allowedTransitions: [...commercialStatusValues] }])) as Record<RequestStatus, RequestStatusConfig>;
export const activeRequestStatuses: readonly RequestStatus[] = ["nouveau", "devis_a_preparer", "devis_envoye"];
export const pipelineRequestStatuses: readonly RequestStatus[] = ["nouveau", "devis_a_preparer", "devis_envoye", "accepte"];
export function getAllowedRequestStatuses(_status?: RequestStatus) { return requestStatusValues; }
