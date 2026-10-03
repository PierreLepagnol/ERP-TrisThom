import { normalizeRequestStatus } from "@/domain/request-status";
import { getEffectiveServices } from "./effective-services";
import type { LocalRequest, Quote, QuoteVersion } from "@/lib/local-crm";

const day = 86_400_000;

export function getCurrentQuoteVersion(quote?: Quote): QuoteVersion | undefined {
  return quote?.versions.find((version) => version.id === quote.currentVersionId) ?? quote?.versions.at(-1);
}

export function getOperationalServices(requests: readonly LocalRequest[], now = Date.now()) {
  const services = getEffectiveServices(requests).filter(event => ["accepte", "termine"].includes(event.status));
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const upcoming = services
    .filter(event => normalizeRequestStatus(event.request.status) === "accepte" && event.request.archivedAt == null)
    .sort((left, right) => (left.date ?? Infinity) - (right.date ?? Infinity));
  const recentlyCompleted = services
    .filter(event => normalizeRequestStatus(event.request.status) === "termine" && event.date != null && event.date >= now - 30 * day && event.date <= now)
    .sort((left, right) => (right.date ?? 0) - (left.date ?? 0));

  return { upcoming, recentlyCompleted };
}
