import type { LocalRequest, Quote } from "@/lib/local-crm";
import { normalizeRequestStatus } from "@/domain/request-status";
import type { CommercialStatus } from "@/domain/request-status";

export type RequestListView = "active" | "week" | "without_date" | "history";
export function matchesRequestView(request: LocalRequest, view: RequestListView, now = Date.now()) {
  const status = normalizeRequestStatus(request.status);
  if (view === "history") return ["termine", "refuse", "annule"].includes(status);
  if (view === "without_date") return !request.eventDate && !["termine", "refuse", "annule"].includes(status);
  if (view === "week") { const end = now + 7 * 86_400_000; return Boolean(request.eventDate && request.eventDate >= now && request.eventDate < end && !["termine", "refuse", "annule"].includes(status)); }
  return !["termine", "refuse", "annule"].includes(status);
}

export function normalizeRequestSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function matchesRequestSearch(request: LocalRequest, query: string, quote?: Quote) {
  const needle = normalizeRequestSearch(query);
  if (!needle) return true;
  return [request.contactName, request.organizationName, request.contactEmail, request.contactPhone, request.eventType, request.eventAddress, request.venue, quote?.quoteNumber].some((value) => normalizeRequestSearch(value ?? "").includes(needle));
}
export function matchesRequestFilters(request: LocalRequest, statuses: ReadonlySet<CommercialStatus>, sources: ReadonlySet<LocalRequest["source"]>) {
  return (!statuses.size || statuses.has(normalizeRequestStatus(request.status))) && (!sources.size || sources.has(request.source));
}
export function needsActionToday(request: LocalRequest, now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86400000;
  const activeFollowUp = request.followUps.some((item) => !item.completedAt && item.dueAt < end);
  return activeFollowUp || Boolean(request.nextActionAt && request.nextActionAt < end);
}

export function sortRequests(requests: readonly LocalRequest[], sort: "priority" | "nextAction" | "eventDate" | "eventDateDesc" | "receivedAt" | "receivedAtAsc" | "amount", now = Date.now()) {
  return [...requests].sort((left, right) => {
    if (sort === "priority") return Number(needsActionToday(right, now)) - Number(needsActionToday(left, now)) || (left.nextActionAt ?? Infinity) - (right.nextActionAt ?? Infinity);
    if (sort === "nextAction") return (left.nextActionAt ?? Infinity) - (right.nextActionAt ?? Infinity);
    if (sort === "eventDate") return (left.eventDate ?? Infinity) - (right.eventDate ?? Infinity);
    if (sort === "eventDateDesc") return (right.eventDate ?? -Infinity) - (left.eventDate ?? -Infinity);
    if (sort === "amount") return (right.quoteAmountCents ?? right.budgetCents ?? 0) - (left.quoteAmountCents ?? left.budgetCents ?? 0);
    return sort === "receivedAtAsc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt;
  });
}
