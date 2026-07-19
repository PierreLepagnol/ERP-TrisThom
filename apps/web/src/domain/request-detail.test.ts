// @ts-expect-error Bun supplies this module when running `bun test`.
import { describe, expect, it } from "bun:test";
import { latestRequestNote, requestDetailTabs, requestPrimaryAction, requestQuoteSummary } from "./request-detail";

const request = {
  _id: "r1", status: "qualifie", contactName: "Camille", source: "manuel", missingInformation: [], followUps: [], notes: [{ id: "old", content: "Ancienne", createdAt: 1 }, { id: "new", content: "Récente", createdAt: 2 }], history: [], createdAt: 1, updatedAt: 1,
} as any;

describe("request detail helpers", () => {
  it("exposes the four local tabs", () => expect(requestDetailTabs).toEqual(["resume", "devis", "echanges", "historique"]));
  it("selects the latest note regardless of storage order", () => expect(latestRequestNote(request)?.content).toBe("Récente"));
  it("shows no quote when there is none and its summary when it exists", () => {
    expect(requestQuoteSummary()).toMatchObject({ state: "Aucun devis" });
    expect(requestQuoteSummary({ quoteNumber: "D-1", currentVersionId: "v1", status: "brouillon", totalTtcCents: 1234, versions: [{ id: "v1", versionNumber: 2 }] } as any)).toMatchObject({ quoteNumber: "D-1", versionNumber: 2, totalTtcCents: 1234 });
  });
  it("keeps the existing primary-action rules", () => expect(requestPrimaryAction(request).kind).toBe("contact"));
});
