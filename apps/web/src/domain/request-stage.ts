import type { RequestStatus } from "@/domain/request-status";

/** The five business stages displayed to users while legacy Convex statuses remain stored. */
export const requestStageValues = ["a_traiter", "devis_envoye", "confirme", "termine", "perdu"] as const;
export type RequestStage = (typeof requestStageValues)[number];

export type RequestStageInput = {
  status: RequestStatus;
  eventDate?: number;
};

export const requestStageConfig: Record<RequestStage, { label: string; badgeClassName: string }> = {
  a_traiter: { label: "À traiter", badgeClassName: "bg-sky-50 text-sky-800 ring-sky-100" },
  devis_envoye: { label: "Devis envoyé", badgeClassName: "bg-blue-50 text-blue-800 ring-blue-100" },
  confirme: { label: "Confirmé", badgeClassName: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
  termine: { label: "Terminé", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200" },
  perdu: { label: "Perdu", badgeClassName: "bg-stone-100 text-stone-700 ring-stone-200" },
};

function startOfToday(now: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Maps persisted legacy statuses to the stable business vocabulary used by the CRM. */
export function getRequestStage(request: RequestStageInput, now = Date.now()): RequestStage {
  if (["nouveau", "a_qualifier", "qualifie", "devis_a_preparer"].includes(request.status)) return "a_traiter";
  if (["devis_envoye", "relance"].includes(request.status)) return "devis_envoye";
  if (["refuse", "annule"].includes(request.status)) return "perdu";

  // An accepted request stays confirmed when its event date is unknown.
  return request.eventDate !== undefined && request.eventDate < startOfToday(now) ? "termine" : "confirme";
}

export function isHistoricalRequest(request: RequestStageInput, now = Date.now()) {
  return ["termine", "perdu"].includes(getRequestStage(request, now));
}
