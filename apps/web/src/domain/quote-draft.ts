export type QuoteDraftLine = {
  label: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  details?: string[];
};

export type QuoteDraftContent = {
  template: string;
  issueDate: number;
  validUntil: number;
  depositPercent: number;
  included: string;
  excluded: string;
  logistics: string;
  introduction?: string;
  conditions?: string;
  remarks?: string;
  discountCents: number;
  lines: readonly QuoteDraftLine[];
};

export type QuoteVersionStatus = "brouillon" | "pret" | "envoye" | "accepte" | "refuse";

export function isQuoteVersionFrozen(status: QuoteVersionStatus) {
  return status === "envoye" || status === "accepte" || status === "refuse";
}

export function canSaveOverQuoteVersion(
  currentStatus: QuoteVersionStatus | undefined,
  nextStatus: QuoteVersionStatus,
) {
  void nextStatus;
  if (!currentStatus || !isQuoteVersionFrozen(currentStatus)) return true;
  return false;
}

export function selectQuoteVersion<T extends { id: string }>(
  versions: readonly T[],
  currentVersionId: string,
  requestedVersionId?: string,
) {
  return versions.find((version) => version.id === (requestedVersionId ?? currentVersionId));
}

export function isQuoteDraftModified(
  draft: QuoteDraftContent,
  saved: QuoteDraftContent | undefined,
) {
  if (!saved) return true;
  return quoteDraftFingerprint(draft) !== quoteDraftFingerprint(saved);
}

export function quoteDraftFingerprint(quote: QuoteDraftContent) {
  return JSON.stringify({
    template: quote.template,
    issueDate: quote.issueDate,
    validUntil: quote.validUntil,
    depositPercent: quote.depositPercent,
    included: quote.included,
    excluded: quote.excluded,
    logistics: quote.logistics,
    introduction: quote.introduction ?? "",
    conditions: quote.conditions ?? "",
    remarks: quote.remarks ?? "",
    discountCents: quote.discountCents,
    lines: quote.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
      details: line.details ?? [],
    })),
  });
}
