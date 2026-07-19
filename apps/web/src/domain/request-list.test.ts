// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import { matchesRequestSearch, needsActionToday, normalizeRequestSearch, sortRequests } from "./request-list";
const request: any = { _id: "r", contactName: "Élodie Martin", organizationName: "Maison Brûlée", contactEmail: "elodie@maison.fr", contactPhone: "0612345678", eventType: "Cocktail", eventAddress: "Paris", status: "qualifie", missingInformation: [], followUps: [], createdAt: 1, updatedAt: 1 };
test("search covers client, company, email, phone, quote and accents", () => { for (const value of ["elodie", "maison brulee", "elodie@", "123456", "D-2026"]) expect(matchesRequestSearch(request, value, { quoteNumber: "D-2026-001" } as any)).toBe(true); expect(normalizeRequestSearch("Élodie")).toBe("elodie"); });
test("today actions exclude future accepted work", () => { expect(needsActionToday({ ...request, status: "accepte" }, Date.now())).toBe(false); expect(needsActionToday({ ...request, missingInformation: ["Date"] }, Date.now())).toBe(true); });
test("sort by next action", () => expect(sortRequests([{ ...request, _id: "late", nextActionAt: 20 }, { ...request, _id: "early", nextActionAt: 10 }], "nextAction", 0).map((item) => item._id)).toEqual(["early", "late"]));
