import type { LocalRequest, Quote } from "@/lib/local-crm";

export function normalizeRequestSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function matchesRequestSearch(request: LocalRequest, query: string, quote?: Quote) {
  const needle = normalizeRequestSearch(query);
  if (!needle) return true;
  return [request.contactName, request.organizationName, request.contactEmail, request.contactPhone, request.eventType, request.eventAddress, request.venue, quote?.quoteNumber].some((value) => normalizeRequestSearch(value ?? "").includes(needle));
}

export function needsActionToday(request: LocalRequest, now = Date.now()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = start.getTime() + 86400000;
  const activeFollowUp = request.followUps.some((item) => !item.completedAt && item.dueAt < end);
  return activeFollowUp || request.missingInformation.length > 0 || request.status === "devis_a_preparer" || Boolean(request.nextActionAt && request.nextActionAt < end);
}

export function sortRequests(requests: readonly LocalRequest[], sort: "priority" | "nextAction" | "eventDate" | "receivedAt" | "amount", now = Date.now()) {
  return [...requests].sort((left, right) => {
    if (sort === "priority") return Number(needsActionToday(right, now)) - Number(needsActionToday(left, now)) || (left.nextActionAt ?? Infinity) - (right.nextActionAt ?? Infinity);
    if (sort === "nextAction") return (left.nextActionAt ?? Infinity) - (right.nextActionAt ?? Infinity);
    if (sort === "eventDate") return (left.eventDate ?? Infinity) - (right.eventDate ?? Infinity);
    if (sort === "amount") return (right.quoteAmountCents ?? right.budgetCents ?? 0) - (left.quoteAmountCents ?? left.budgetCents ?? 0);
    return right.createdAt - left.createdAt;
  });
}

export function filterOperationalRequests(requests: readonly LocalRequest[], filter: "tous" | "a_traiter" | "nouvelles" | "qualifier" | "devis_preparer" | "devis_relances" | "acceptees", now = Date.now()) {
  return requests.filter((request) => filter === "tous" || (filter === "a_traiter" && needsActionToday(request, now)) || (filter === "nouvelles" && request.status === "nouveau") || (filter === "qualifier" && request.status === "a_qualifier") || (filter === "devis_preparer" && request.status === "devis_a_preparer") || (filter === "devis_relances" && ["devis_envoye", "relance"].includes(request.status)) || (filter === "acceptees" && request.status === "accepte"));
}
