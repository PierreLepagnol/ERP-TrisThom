// @ts-expect-error Bun supplies this module when running bun test.
import { expect, test } from "bun:test";
import { siteEntryDefaults } from "./site-entry-defaults";

test("old structured site entries prefill available fields without inventing missing data", () => {
  const result = siteEntryDefaults({ source: "directus", sourceData: { contactName: "Alice", contactPhone: "0102030405", eventDate: Date.parse("2026-10-31T23:30:00Z"), eventAddress: "Paris", guestCount: 31, eventType: "Buffet", message: "Original" } });
  expect(result).toMatchObject({ name: "Alice", phone: "0102030405", eventDate: "2026-11-01", venue: "Paris", guests: 31, eventType: "Buffet", message: "Original", adminNotes: "", email: "" });
  expect(result?.budgetPerPerson).toBeUndefined();
});
test("new formats and administrative notes remain separate", () => {
  expect(siteEntryDefaults({ source: "directus", sourceData: { contactName: "Bob", cateringFormat: "Buffet", format: "Livraison", adminNotes: "Interne", quotedAmount: 900, siteStatus: "accepted", message: "Client" } })).toMatchObject({ eventType: "Buffet", notes: "Buffet · Livraison", adminNotes: "Interne", message: "Client" });
});
test("email and 1001 entries do not use site defaults", () => {
  expect(siteEntryDefaults({ source: "email", senderEmail: "test@1001traiteurs.com" })).toBeUndefined();
  expect(siteEntryDefaults({ senderName: "Mail" })).toBeUndefined();
});

