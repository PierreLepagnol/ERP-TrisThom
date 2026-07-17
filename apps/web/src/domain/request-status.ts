export const requestStatusValues = [
  "nouveau",
  "a_qualifier",
  "qualifie",
  "devis_a_preparer",
  "devis_envoye",
  "relance",
  "accepte",
  "refuse",
  "annule",
] as const;

export type RequestStatus = (typeof requestStatusValues)[number];
export type RequestStatusCategory = "active" | "won" | "lost";

export type RequestStatusConfig = {
  value: RequestStatus;
  label: string;
  description: string;
  order: number;
  category: RequestStatusCategory;
  badgeClassName: string;
  calendarClassName: string;
  allowedTransitions: RequestStatus[];
};

export const requestStatusConfig: Record<RequestStatus, RequestStatusConfig> = {
  nouveau: { value: "nouveau", label: "Nouveau", description: "Demande à prendre en charge.", order: 1, category: "active", badgeClassName: "bg-sky-50 text-sky-800 ring-sky-100", calendarClassName: "bg-sky-100 text-sky-900 hover:bg-sky-200", allowedTransitions: ["a_qualifier", "qualifie", "refuse", "annule"] },
  a_qualifier: { value: "a_qualifier", label: "À qualifier", description: "Informations à compléter avant le chiffrage.", order: 2, category: "active", badgeClassName: "bg-amber-50 text-amber-900 ring-amber-100", calendarClassName: "bg-amber-100 text-amber-900 hover:bg-amber-200", allowedTransitions: ["qualifie", "refuse", "annule"] },
  qualifie: { value: "qualifie", label: "Qualifiée", description: "Demande complète, prête à être chiffrée.", order: 3, category: "active", badgeClassName: "bg-violet-50 text-violet-800 ring-violet-100", calendarClassName: "bg-violet-100 text-violet-900 hover:bg-violet-200", allowedTransitions: ["devis_a_preparer", "refuse", "annule"] },
  devis_a_preparer: { value: "devis_a_preparer", label: "Devis à préparer", description: "Proposition commerciale à construire.", order: 4, category: "active", badgeClassName: "bg-orange-50 text-orange-900 ring-orange-100", calendarClassName: "bg-orange-100 text-orange-900 hover:bg-orange-200", allowedTransitions: ["devis_envoye", "refuse", "annule"] },
  devis_envoye: { value: "devis_envoye", label: "Devis envoyé", description: "En attente du retour client.", order: 5, category: "active", badgeClassName: "bg-blue-50 text-blue-800 ring-blue-100", calendarClassName: "bg-blue-100 text-blue-900 hover:bg-blue-200", allowedTransitions: ["relance", "accepte", "refuse", "annule"] },
  relance: { value: "relance", label: "Relance", description: "Retour client à obtenir.", order: 6, category: "active", badgeClassName: "bg-rose-50 text-rose-800 ring-rose-100", calendarClassName: "bg-rose-100 text-rose-900 hover:bg-rose-200", allowedTransitions: ["devis_envoye", "accepte", "refuse", "annule"] },
  accepte: { value: "accepte", label: "Accepté", description: "Prestation confirmée.", order: 7, category: "won", badgeClassName: "bg-emerald-50 text-emerald-800 ring-emerald-100", calendarClassName: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200", allowedTransitions: ["annule"] },
  refuse: { value: "refuse", label: "Refusé", description: "Proposition refusée par le client.", order: 8, category: "lost", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200", allowedTransitions: [] },
  annule: { value: "annule", label: "Annulé", description: "Dossier annulé avant sa réalisation.", order: 9, category: "lost", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200", calendarClassName: "bg-stone-100 text-stone-700 hover:bg-stone-200", allowedTransitions: [] },
};

export const activeRequestStatuses = requestStatusValues.filter(
  (status) => requestStatusConfig[status].category === "active",
);

export const pipelineRequestStatuses = requestStatusValues.filter(
  (status) => requestStatusConfig[status].category !== "lost",
);

export function getAllowedRequestStatuses(status: RequestStatus) {
  return [status, ...requestStatusConfig[status].allowedTransitions];
}
