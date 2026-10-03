// @ts-expect-error Bun supplies this module when running bun test.
import { expect, test } from "bun:test";
import type { LocalRequest } from "@/lib/local-crm";
import { getPlanningServices, requestDateSummary } from "./effective-services";
import { getOperationalServices } from "./service";
const date = (day: number) => new Date(2026, 9, day, 12).getTime();
const dossier = (id: string, day: number): LocalRequest => ({ _id: id, contactName: "Romane", contactId: "romane", source: "email", status: "accepte", eventDate: date(day), missingInformation: [], notes: [], history: [], followUps: [], createdAt: 1, updatedAt: 1 });
test("three dates are three dossier destinations sharing one client", () => {
  const rows = [dossier("oct-3", 3), dossier("oct-10", 10), dossier("oct-17", 17)];
  expect(getPlanningServices(rows).map(row => row.requestId)).toEqual(["oct-3", "oct-10", "oct-17"]);
  expect(getOperationalServices(rows, date(1)).upcoming).toHaveLength(3);
});
test("unreviewed legacy events cannot silently use a stale dossier date", () => {
  const row = { ...dossier("legacy", 3), legacyEvents: [{ _id: "event", label: "Autre date", date: date(10), status: "confirmee" }] };
  expect(getPlanningServices([row])).toEqual([]);
  expect(requestDateSummary(row)).toContain("reprendre");
});
test("a cancelled or deleted dossier cannot appear in planning", () => {
  expect(getPlanningServices([{ ...dossier("cancelled", 3), status: "annule" }, { ...dossier("deleted", 10), deletedAt: 1 }])).toEqual([]);
});
