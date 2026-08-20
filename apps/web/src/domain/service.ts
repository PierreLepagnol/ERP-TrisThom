import { normalizeRequestStatus } from "@/domain/request-status";
import type { LocalRequest, Quote, QuoteVersion } from "@/lib/local-crm";

const day = 86_400_000;

export function getCurrentQuoteVersion(quote?: Quote): QuoteVersion | undefined {
  return quote?.versions.find((version) => version.id === quote.currentVersionId) ?? quote?.versions.at(-1);
}

export function getOperationalServices(requests: readonly LocalRequest[], now = Date.now()) {
  const upcoming = requests
    .filter((request) => normalizeRequestStatus(request.status) === "accepte" && (request.eventDate ?? Infinity) >= now)
    .sort((left, right) => (left.eventDate ?? Infinity) - (right.eventDate ?? Infinity));
  const recentlyCompleted = requests
    .filter((request) => normalizeRequestStatus(request.status) === "termine" && (request.eventDate ?? 0) >= now - 30 * day)
    .sort((left, right) => (right.eventDate ?? 0) - (left.eventDate ?? 0));

  return { upcoming, recentlyCompleted };
}
