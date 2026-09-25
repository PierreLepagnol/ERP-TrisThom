// @ts-expect-error Bun supplies this module when running bun test.
import { expect, test } from "bun:test";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import type { EffectiveRequestEvent } from "@ERPTrisThom/backend/convex/effectiveRequestEvents";
import type { LocalRequest } from "@/lib/local-crm";
import { getPlanningServices, getRequestEvents, requestDateSummary } from "./effective-services";
import { getOperationalServices } from "./service";
import { matchesRequestView, sortRequests } from "./request-list";

const date = (day: number) => new Date(2026, 9, day, 12).getTime();
const now = new Date(2026, 9, 1, 10).getTime();
const event = (day: number, status: EffectiveRequestEvent["status"] = "confirmee"): EffectiveRequestEvent => ({
  _id: ("event-" + day) as Id<"requestEvents">, historical: false, label: "Plateaux repas",
  date: date(day), startTime: "08:43", endTime: "09:30", address: "Cergy", guestCount: 10, status,
});
const dossier = (events?: EffectiveRequestEvent[]): LocalRequest => ({
  _id: "romane", contactName: "Romane Meulle", organizationName: "Points communs", status: "accepte", source: "email",
  eventDate: date(3), eventStartTime: "08:43", eventEndTime: "09:30", guestCount: 10,
  effectiveEvents: events, missingInformation: [], notes: [], history: [], followUps: [], createdAt: 1, updatedAt: 1,
});

test("a historical dossier still supplies exactly one virtual prestation", () => {
  const request = dossier();
  expect(getRequestEvents(request)).toMatchObject([{ historical: true, date: date(3) }]);
  expect(getPlanningServices([request])).toHaveLength(1);
  expect(getOperationalServices([request], now).upcoming).toHaveLength(1);
});

test("two real dates produce two planning and operational entries with the same parent", () => {
  const request = dossier([event(3), event(10)]);
  const planned = getPlanningServices([request]);
  expect(planned.map(row => row.date)).toEqual([date(3), date(10)]);
  expect(planned.map(row => row.requestId)).toEqual(["romane", "romane"]);
  expect(new Set(planned.map(row => row._id)).size).toBe(2);
  expect(getOperationalServices([request], now).upcoming.map(row => row.date)).toEqual([date(3), date(10)]);
  expect(sortRequests([request], "eventDate")).toHaveLength(1);
  expect(requestDateSummary(request)).toBe("2 prestations · 3 et 10 oct.");
});

test("materialized dates always override a stale legacy date, even with one real prestation", () => {
  const request = dossier([event(10)]);
  expect(getPlanningServices([request]).map(row => row.date)).toEqual([date(10)]);
  expect(requestDateSummary(request)).toBe("10 oct.");
  expect(getOperationalServices([request], now).upcoming).toHaveLength(1);
});

test("cancelled dates never show as active and do not resurrect the legacy date", () => {
  const request = dossier([event(3, "annulee"), event(10)]);
  expect(getPlanningServices([request]).map(row => row.date)).toEqual([date(10)]);
  expect(getOperationalServices([request], now).upcoming.map(row => row.date)).toEqual([date(10)]);
  const cancelled = dossier([event(3, "annulee")]);
  expect(getPlanningServices([cancelled])).toHaveLength(0);
  expect(getOperationalServices([cancelled], now).upcoming).toHaveLength(0);
  expect(requestDateSummary(cancelled)).toContain("Annulée");
});

test("operational status is independent from the confirmed dossier", () => {
  const request = dossier([event(3, "demandee"), event(10), event(17, "potentielle")]);
  expect(getPlanningServices([request])).toHaveLength(3);
  expect(getOperationalServices([request], now).upcoming.map(row => row.date)).toEqual([date(10)]);
});

test("commercial summaries stay compact and include missing dates", () => {
  const events = Array.from({ length: 9 }, (_, i) => event(i === 8 ? 30 : 8 + i));
  expect(requestDateSummary(dossier(events))).toBe("9 prestations · 8 oct. → 30 oct.");
  expect(requestDateSummary(dossier([event(3), { ...event(10), date: undefined }]))).toContain("1 sans date");
});

test("week and without-date filters inspect each real prestation, not the legacy mirror", () => {
  const request = dossier([event(3), event(10)]);
  expect(matchesRequestView(request, "week", date(9))).toBe(true);
  expect(matchesRequestView(dossier([{ ...event(10), date: undefined }]), "without_date", now)).toBe(true);
  expect(matchesRequestView(dossier([event(10)]), "week", date(1))).toBe(false);
});

test("today's confirmed prestations remain operational after their timestamp", () => {
  const request = dossier([event(3)]);
  expect(getOperationalServices([request], date(3) + 3600000).upcoming).toHaveLength(1);
});

test("deleted dossiers are absent and an undated real prestation creates no legacy planning card", () => {
  expect(getPlanningServices([{ ...dossier([event(3)]), deletedAt: 1 }])).toHaveLength(0);
  expect(getPlanningServices([dossier([{ ...event(10), date: undefined }])])).toHaveLength(0);
});
