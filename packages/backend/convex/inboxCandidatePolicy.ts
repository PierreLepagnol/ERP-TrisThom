import type { Doc } from "./_generated/dataModel";

type SearchableRequest = Pick<Doc<"requests">, "contactName" | "organizationName" | "contactEmail" | "eventType" | "status" | "archivedAt" | "deletedAt">;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}

export function matchesInboxCandidate(request: SearchableRequest, search: string, history: boolean) {
  if (request.deletedAt != null) return false;
  const historical = request.archivedAt != null || ["termine", "refuse", "annule"].includes(request.status);
  if (historical !== history) return false;
  const text = normalize([request.contactName, request.organizationName, request.contactEmail, request.eventType].filter(Boolean).join(" "));
  return normalize(search).split(/\s+/).every(term => text.includes(term));
}
