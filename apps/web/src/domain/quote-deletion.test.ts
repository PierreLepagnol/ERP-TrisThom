import { describe, expect, it } from "bun:test";
import { canDeleteQuoteVersion, deleteQuoteVersionFromQuote } from "./quote-deletion";
import type { Quote, QuoteVersion } from "@/lib/local-crm";

const version = (id: string, versionNumber: number, status: QuoteVersion["status"], sentAt?: number): QuoteVersion => ({
  id, versionNumber, status, sentAt, createdAt: 1, updatedAt: 1, lines: [{ id: `${id}-line`, label: id, quantity: 1, unitPriceCents: versionNumber * 1000, vatRate: 10 }], discountCents: 0, issueDate: 1, validUntil: 2, depositPercent: 50, included: "", excluded: "", logistics: "", template: "libre", totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0,
});
const quote = (versions: QuoteVersion[], currentVersionId = versions.at(-1)!.id): Quote => ({
  id: "quote", requestId: "request", quoteNumber: "D-2026-001", currentVersionId, status: versions.find((item) => item.id === currentVersionId)!.status, createdAt: 1, updatedAt: 1, totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0, versions,
});

describe("quote deletion", () => {
  it("allows an unsent ready version to be removed", () => {
    expect(canDeleteQuoteVersion(version("v1", 1, "pret"))).toBe(true);
  });

  it("removes the only draft quote by returning no quote", () => {
    expect(deleteQuoteVersionFromQuote(quote([version("v1", 1, "brouillon")]), "v1")).toBeUndefined();
  });

  it("returns the highest remaining version and its recalculated totals when removing the current draft", () => {
    const result = deleteQuoteVersionFromQuote(quote([version("v1", 1, "pret"), version("v2", 2, "brouillon")]), "v2");
    expect(result?.currentVersionId).toBe("v1");
    expect(result?.status).toBe("pret");
    expect(result?.totalTtcCents).toBe(1100);
  });

  it("returns to the sent version after deleting a newer draft", () => {
    const result = deleteQuoteVersionFromQuote(quote([version("v1", 1, "envoye", 42), version("v2", 2, "brouillon")]), "v2");
    expect(result?.currentVersionId).toBe("v1");
    expect(result?.status).toBe("envoye");
    expect(result?.sentAt).toBe(42);
  });

  it("does not change the current version when removing a non-current draft", () => {
    const result = deleteQuoteVersionFromQuote(quote([version("v1", 1, "brouillon"), version("v2", 2, "pret")], "v2"), "v1");
    expect(result?.currentVersionId).toBe("v2");
  });

  it("never allows sent, accepted, refused, or sentAt versions to be removed", () => {
    for (const protectedVersion of [version("sent", 1, "envoye"), version("accepted", 1, "accepte"), version("refused", 1, "refuse"), version("inconsistent", 1, "brouillon", 42)]) {
      expect(canDeleteQuoteVersion(protectedVersion)).toBe(false);
      expect(() => deleteQuoteVersionFromQuote(quote([protectedVersion]), protectedVersion.id)).toThrow();
    }
  });
});
