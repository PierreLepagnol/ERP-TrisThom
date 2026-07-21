/** Commercial statuses shown in the application. Deprecated statuses still
 * exist in the backend temporarily so historical records can be migrated. */
export const requestStatusValues = [
  "nouveau", "a_qualifier", "qualifie", "devis_a_preparer", "devis_envoye", "relance", "accepte", "refuse", "annule",
] as const;
/** Deprecated values remain readable for historical data but are never shown in the UI. */
export const commercialStatusValues = ["nouveau", "devis_a_preparer", "devis_envoye", "accepte", "refuse", "annule"] as const;

export type RequestStatus = (typeof requestStatusValues)[number];
export type RequestStatusCategory = "active" | "won" | "lost";

export type RequestStatusConfig = {
  value: RequestStatus; label: string; description: string; order: number;
  category: RequestStatusCategory; badgeClassName: string; calendarClassName: string;
  allowedTransitions: RequestStatus[];
};

export const requestStatusConfig: Record<RequestStatus, RequestStatusConfig> = {
  nouveau: { value: "nouveau", label: "Nouveau", description: "Demande à prendre en charge.", order: 1, category: "active", badgeClassName: "bg-sky-50 text-sky-800 ring-sky-100", calendarClassName: "bg-sky-100 text-sky-900 hover:bg-sky-200", allowedTransitions: ["devis_a_preparer", "refuse", "annule"] },
  a_qualifier: { value: "a_qualifier", label: "Nouveau", description: "Valeur historique à migrer.", order: 1, category: "active", badgeClassName: "bg-sky-50 text-sky-800 ring-sky-100", calendarClassName: "bg-sky-100 text-sky-900 hover:bg-sky-200", allowedTransitions: ["devis_a_preparer", "refuse", "annule"] },
  qualifie: { value: "qualifie", label: "Devis à préparer", description: "Valeur historique à migrer.", order: 2, category: "active", badgeClassName: "bg-orange-50 text-orange-900 ring-orange-100", calendarClassName: "bg-orange-100 text-orange-900 hover:bg-orange-200", allowedTransitions: ["devis_a_preparer", "refuse", "annule"] },
  devis_a_preparer: { value: "devis_a_preparer", label: "Devis à préparer", description: "Proposition commerciale à construire.", order: 2, category: "active", badgeClassName: "bg-orange-50 text-orange-900 ring-orange-100", calendarClassName: "bg-orange-100 text-orange-900 hover:bg-orange-200", allowedTransitions: ["devis_envoye", "refuse", "annule"] },
  devis_envoye: { value: "devis_envoye", label: "Devis envoyé", description: "En attente du retour client.", order: 3, category: "active", badgeClassName: "bg-blue-50 text-blue-800 ring-blue-100", calendarClassName: "bg-blue-100 text-blue-900 hover:bg-blue-200", allowedTransitions: ["accepte", "refuse", "annule"] },
  relance: { value: "relance", label: "Devis envoyé", description: "Valeur historique à migrer.", order: 3, category: "active", badgeClassName: "bg-blue-50 text-blue-800 ring-blue-100", calendarClassName: "bg-blue-100 text-blue-900 hover:bg-blue-200", allowedTransitions: ["accepte", "refuse", "annule"] },
  accepte: { value: "accepte", label: "Accepté", description: "Prestation confirmée.", order: 4, category: "won", badgeClassName: "bg-emerald-50 text-emerald-800 ring-emerald-100", calendarClassName: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200", allowedTransitions: ["annule"] },
  refuse: { value: "refuse", label: "Perdu", description: "Proposition non retenue.", order: 5, category: "lost", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200", allowedTransitions: [] },
  annule: { value: "annule", label: "Annulé", description: "Dossier annulé avant sa réalisation.", order: 6, category: "lost", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200", allowedTransitions: [] },
};

export const activeRequestStatuses: readonly RequestStatus[] = commercialStatusValues.filter((status) => requestStatusConfig[status].category === "active");
export const pipelineRequestStatuses: readonly RequestStatus[] = commercialStatusValues.filter((status) => requestStatusConfig[status].category !== "lost");
export function getAllowedRequestStatuses(status: RequestStatus) { return [status, ...requestStatusConfig[status].allowedTransitions]; }
