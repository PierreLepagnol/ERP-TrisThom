import { calculateQuoteTotals } from "@/domain/quote-calculation";
import type { Quote, QuoteVersion } from "@/lib/local-crm";

export function canDeleteQuoteVersion(version: Pick<QuoteVersion, "status" | "sentAt">): boolean {
  return !version.sentAt && (version.status === "brouillon" || version.status === "pret");
}

export function deleteQuoteVersionFromQuote(quote: Quote, versionId: string): Quote | undefined {
  const target = quote.versions.find((version) => version.id === versionId);
  if (!target) throw new Error("Version de devis introuvable.");
  if (!canDeleteQuoteVersion(target)) {
    throw new Error("Cette version a une valeur historique et ne peut pas être supprimée.");
  }
  const versions = quote.versions.filter((version) => version.id !== versionId);
  if (!versions.length) return undefined;
  const currentVersion = target.id === quote.currentVersionId
    ? [...versions].sort((left, right) => right.versionNumber - left.versionNumber)[0]!
    : quote.versions.find((version) => version.id === quote.currentVersionId) ?? versions.at(-1)!;
  const totals = calculateQuoteTotals(currentVersion.lines, currentVersion.discountCents);
  return {
    ...quote,
    currentVersionId: currentVersion.id,
    status: currentVersion.status,
    sentAt: currentVersion.sentAt,
    acceptedAt: currentVersion.status === "accepte" ? quote.acceptedAt : undefined,
    totalHtCents: totals.totalHtCents,
    totalVatCents: totals.totalVatCents,
    totalTtcCents: totals.totalTtcCents,
    versions,
  };
}
