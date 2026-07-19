import { getRequestNextAction } from "@/domain/request-qualification";
import type { LocalRequest, Quote } from "@/lib/local-crm";

export const requestDetailTabs = ["resume", "devis", "echanges", "historique"] as const;
export type RequestDetailTab = (typeof requestDetailTabs)[number];

export function latestRequestNote(request: Pick<LocalRequest, "notes">) {
  return request.notes.slice().sort((left, right) => right.createdAt - left.createdAt)[0];
}

export function requestQuoteSummary(quote?: Quote) {
  if (!quote) return { state: "Aucun devis", quoteNumber: undefined, versionNumber: undefined, totalTtcCents: undefined };
  const current = quote.versions.find((version) => version.id === quote.currentVersionId);
  return { state: quote.status, quoteNumber: quote.quoteNumber, versionNumber: current?.versionNumber, totalTtcCents: quote.totalTtcCents };
}

export function requestPrimaryAction(request: LocalRequest) {
  return getRequestNextAction(request);
}
