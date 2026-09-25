import { effectiveRequestEvents } from "@ERPTrisThom/backend/convex/effectiveRequestEvents";
import { normalizeRequestStatus } from "./request-status";
import type { LocalRequest } from "@/lib/local-crm";

export function getRequestEvents(request: LocalRequest) {
  // The backend supplies these; the shared pure fallback also supports local demo dossiers.
  return request.effectiveEvents ?? effectiveRequestEvents(request, []);
}

export function getEffectiveServices(requests: readonly LocalRequest[]) {
  return requests.filter(request => request.deletedAt == null).flatMap(request =>
    getRequestEvents(request).map(event => ({
      ...event, _id: event._id ?? request._id, requestId: request._id, request,
    })));
}
export type EffectiveService = ReturnType<typeof getEffectiveServices>[number];

export function getPlanningServices(requests: readonly LocalRequest[]) {
  return getEffectiveServices(requests).filter(event =>
    event.date != null && event.status !== "annulee" && event.request.archivedAt == null
    && !["termine", "refuse", "annule"].includes(normalizeRequestStatus(event.request.status)));
}

const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
export function requestDateSummary(request: LocalRequest) {
  const events = getRequestEvents(request);
  if (events.length === 1) {
    const event = events[0];
    return (event.date != null ? shortDate.format(event.date) : "Date à préciser") + (event.status === "annulee" ? " · Annulée" : "");
  }
  const active = events.filter(event => event.status !== "annulee");
  const dates = [...new Set(active.flatMap(event => event.date == null ? [] : [event.date]))].sort((a, b) => a - b);
  let summary = events.length + " prestations";
  if (dates.length === 2 && events.length === 2) {
    const [first, last] = dates.map(value => new Date(value));
    summary += first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? " · " + first.getDate() + " et " + shortDate.format(last)
      : " · " + shortDate.format(first) + " et " + shortDate.format(last);
  } else if (dates.length) {
    summary += " · " + shortDate.format(dates[0]) + (dates.length > 1 ? " → " + shortDate.format(dates[dates.length - 1]) : "");
  } else {
    summary += active.length ? " · Dates à préciser" : " · Toutes annulées";
  }
  const undated = active.filter(event => event.date == null).length;
  if (dates.length && undated) summary += " · " + undated + " sans date";
  const cancelled = events.length - active.length;
  if (active.length && cancelled) summary += " · " + cancelled + " annulée" + (cancelled > 1 ? "s" : "");
  return summary;
}
