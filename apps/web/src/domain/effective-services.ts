import { normalizeRequestStatus } from "./request-status";
import type { LocalRequest } from "@/lib/local-crm";

export function getRequestEvents(request: LocalRequest) {
  if (request.legacyEvents?.length) return [];
  return [{ _id: request._id, label: request.eventType || "Prestation", date: request.eventDate, startTime: request.eventStartTime, endTime: request.eventEndTime, address: request.eventAddress || request.venue, guestCount: request.guestCount, serviceType: request.eventType, status: normalizeRequestStatus(request.status) }];
}
export function getEffectiveServices(requests: readonly LocalRequest[]) {
  return requests.filter(request => request.deletedAt == null).flatMap(request => getRequestEvents(request).map(event => ({ ...event, requestId: request._id, request })));
}
export type EffectiveService = ReturnType<typeof getEffectiveServices>[number];
export function getPlanningServices(requests: readonly LocalRequest[]) {
  return getEffectiveServices(requests).filter(event => event.date != null && event.request.archivedAt == null && !["termine", "refuse", "annule"].includes(event.status));
}
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
export function requestDateSummary(request: LocalRequest) {
  if (request.legacyEvents?.length) return "Anciennes prestations à reprendre";
  return request.eventDate != null ? shortDate.format(request.eventDate) : "Date à préciser";
}
