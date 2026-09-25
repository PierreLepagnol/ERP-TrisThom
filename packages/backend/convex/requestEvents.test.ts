/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

// Mock only the external authentication adapter; mutations, validation and DB run in convex-test.
vi.mock("./auth", () => ({
  authComponent: { safeGetAuthUser: (ctx: MutationCtx) => ctx.auth.getUserIdentity() },
}));
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const day = (date: number) => Date.UTC(2026, 9, date, 12);
const fields = (date = 9) => ({
  label: "Repas artistes " + date, date: day(date), startTime: "12:00", endTime: "13:00",
  address: "Pontoise", guestCount: 27, serviceType: "Livraison de repas", format: "Plateaux",
  notes: "Accès cour", status: "demandee" as const,
});

async function setup(extra: Partial<Doc<"requests">> = {}) {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "test-user" });
  const requestId = await t.run(ctx => ctx.db.insert("requests", {
    source: "email", status: "accepte", contactName: "Points communs",
    eventDate: day(8), eventStartTime: "11:30", eventEndTime: "12:30",
    eventAddress: "Cergy", guestCount: 24, eventType: "Repas artistes",
    specialNeeds: "Sans porc", budgetCents: 100000, missingInformation: [],
    createdAt: 1, updatedAt: 1, ...extra,
  }));
  return { t, user, requestId };
}

test("reads a historical prestation without changing or migrating the dossier", async () => {
  const { t, user, requestId } = await setup();
  const before = await t.run(ctx => ctx.db.get(requestId));
  expect(await user.query(api.requestEvents.list, { requestId })).toMatchObject([{
    _id: null, historical: true, date: day(8), address: "Cergy", guestCount: 24, status: "confirmee",
  }]);
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(requestId))).toEqual(before);
});

test("adding a prestation atomically preserves the historical date and all new fields", async () => {
  const { t, user, requestId } = await setup();
  const eventId = await user.mutation(api.requestEvents.create, { requestId, fields: fields() });
  const rows = await user.query(api.requestEvents.list, { requestId });
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ date: day(8), address: "Cergy", guestCount: 24, notes: "Sans porc" });
  expect(await t.run(ctx => ctx.db.get(eventId))).toMatchObject(fields());
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(8), guestCount: 24 });
  await user.mutation(api.requestEvents.create, { requestId, fields: fields(10) });
  expect(await user.query(api.requestEvents.list, { requestId })).toHaveLength(3);
});

test("editing a legacy prestation materializes only one and synchronizes its changes", async () => {
  const { t, user, requestId } = await setup();
  await user.mutation(api.requestEvents.update, { requestId, fields: fields(7) });
  expect(await user.query(api.requestEvents.list, { requestId })).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({
    eventDate: day(7), eventAddress: "Pontoise", guestCount: 27, eventType: "Livraison de repas",
    eventStartTime: "12:00", eventEndTime: "13:00", specialNeeds: "Sans porc",
  });
});

test("moving a prestation earlier updates every legacy summary field", async () => {
  const { t, user, requestId } = await setup();
  const eventId = await user.mutation(api.requestEvents.create, { requestId, fields: fields() });
  await user.mutation(api.requestEvents.update, { requestId, eventId, fields: fields(6) });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({
    eventDate: day(6), eventStartTime: "12:00", eventEndTime: "13:00",
    eventAddress: "Pontoise", venue: "Pontoise", guestCount: 27, eventType: "Livraison de repas",
  });
});

test("deleting the first prestation selects the next, and the last cannot be deleted", async () => {
  const { t, user, requestId } = await setup();
  const eventId = await user.mutation(api.requestEvents.create, { requestId, fields: fields(6) });
  await user.mutation(api.requestEvents.remove, { requestId, eventId });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(8), guestCount: 24 });
  const [last] = await user.query(api.requestEvents.list, { requestId });
  if (!last._id) throw new Error("Expected stored prestation");
  await expect(user.mutation(api.requestEvents.remove, { requestId, eventId: last._id })).rejects.toThrow("au moins une prestation");
  expect(await user.query(api.requestEvents.list, { requestId })).toHaveLength(1);
});

test("cancelled and undated prestations do not precede a dated active prestation", async () => {
  const { t, user, requestId } = await setup();
  await user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(6), status: "annulee" } });
  await user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(), date: undefined } });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(8), guestCount: 24 });
  const rows = await user.query(api.requestEvents.list, { requestId });
  expect(rows[rows.length - 1]?.date).toBeUndefined();
});

test("cancelling all prestations clears legacy fields without losing the prestation data", async () => {
  const { t, user, requestId } = await setup({ venue: "Ancien lieu" });
  const eventId = await user.mutation(api.requestEvents.create, { requestId, fields: fields(6) });
  await user.mutation(api.requestEvents.update, { requestId, eventId, fields: { ...fields(6), status: "annulee" } });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(8), guestCount: 24 });
  const legacy = (await user.query(api.requestEvents.list, { requestId })).find(row => row._id !== eventId)!;
  if (!legacy._id) throw new Error("Expected stored prestation");
  await user.mutation(api.requestEvents.update, {
    requestId, eventId: legacy._id, fields: { label: legacy.label, date: legacy.date, address: legacy.address, status: "annulee" },
  });
  const request = await t.run(ctx => ctx.db.get(requestId));
  for (const key of ["eventDate", "eventStartTime", "eventEndTime", "eventAddress", "venue", "guestCount", "eventType"] as const) {
    expect(request?.[key]).toBeUndefined();
  }
  expect(request?.missingInformation).toContain("Date de l’événement");
  expect(await user.query(api.requestEvents.list, { requestId })).toHaveLength(2);
});

test("empty optional fields clear the existing prestation and its legacy mirror", async () => {
  const { t, user, requestId } = await setup();
  await user.mutation(api.requestEvents.update, { requestId, fields: fields() });
  const [event] = await user.query(api.requestEvents.list, { requestId });
  if (!event._id) throw new Error("Expected stored prestation");
  await user.mutation(api.requestEvents.update, { requestId, eventId: event._id, fields: { label: "À préciser", status: "potentielle" } });
  const request = await t.run(ctx => ctx.db.get(requestId));
  expect(request?.eventDate).toBeUndefined();
  expect(request?.eventAddress).toBeUndefined();
  expect(request?.guestCount).toBeUndefined();
  expect((await t.run(ctx => ctx.db.get(event._id!)))?.notes).toBeUndefined();
});

test("the existing CRM editor still edits legacy dossiers without materialization", async () => {
  const { t, user, requestId } = await setup();
  await user.mutation(api.crm.updateRequest, { requestId, changes: { eventDate: day(12), contactName: "Marine" } });
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(12), contactName: "Marine" });
});

test("the CRM editor updates the mirrored prestation and recomputes the first date", async () => {
  const { t, user, requestId } = await setup();
  await user.mutation(api.requestEvents.create, { requestId, fields: fields() });
  await user.mutation(api.crm.updateRequest, { requestId, changes: { eventDate: day(12), guestCount: 50 } });
  const rows = await user.query(api.requestEvents.list, { requestId });
  expect(rows.find(row => row.date === day(12))).toMatchObject({ guestCount: 50 });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ eventDate: day(9), guestCount: 27 });
});

test("invalid creation does not materialize a legacy prestation", async () => {
  const { t, user, requestId } = await setup();
  await expect(user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(), label: " " } })).rejects.toThrow("libellé");
  await expect(user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(), guestCount: -1 } })).rejects.toThrow("Nombre");
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(0);
});

test("rejects unauthenticated, deleted and cross-dossier changes", async () => {
  const { t, user, requestId } = await setup();
  await expect(t.query(api.requestEvents.list, { requestId })).rejects.toThrow("connecté");
  await expect(t.mutation(api.requestEvents.create, { requestId, fields: fields() })).rejects.toThrow("connecté");
  const eventId = await user.mutation(api.requestEvents.create, { requestId, fields: fields() });
  const otherId = await t.run(ctx => ctx.db.insert("requests", {
    source: "manuel", status: "nouveau", contactName: "Autre", createdAt: 1, updatedAt: 1, missingInformation: [],
  }));
  await expect(user.mutation(api.requestEvents.update, { requestId: otherId, eventId, fields: fields() })).rejects.toThrow("dans ce dossier");
  await expect(user.mutation(api.requestEvents.remove, { requestId: otherId, eventId })).rejects.toThrow("dans ce dossier");
  await t.run(ctx => ctx.db.patch(requestId, { deletedAt: 1 }));
  await expect(user.mutation(api.requestEvents.create, { requestId, fields: fields() })).rejects.toThrow("introuvable");
});


test("workspace keeps one dossier and exposes both real dates without legacy duplication", async () => {
  const { user, requestId } = await setup();
  await user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(10), status: "confirmee" } });
  const workspace = await user.query(api.crm.workspace, {});
  expect(workspace.requests).toHaveLength(1);
  expect(workspace.requests[0].effectiveEvents.map(event => event.date)).toEqual([day(8), day(10)]);
  expect(workspace.requests[0].effectiveEvents).toEqual(await user.query(api.requestEvents.list, { requestId }));
});

test("workspace exposes one virtual historical prestation without migrating the dossier", async () => {
  const { t, user } = await setup();
  const workspace = await user.query(api.crm.workspace, {});
  expect(workspace.requests[0].effectiveEvents).toMatchObject([{ historical: true, date: day(8) }]);
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(0);
});

test("confirmService confirms active real prestations and preserves cancellations", async () => {
  const { t, user, requestId } = await setup({ status: "devis_envoye" });
  await user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(10), status: "potentielle" } });
  const cancelledId = await user.mutation(api.requestEvents.create, { requestId, fields: { ...fields(6), status: "annulee" } });
  await t.run(async ctx => {
    const quoteId = await ctx.db.insert("quotes", {
      requestId, quoteNumber: "D-TEST", status: "envoye", createdAt: 1, updatedAt: 1,
      totalHtCents: 10000, totalVatCents: 1000, totalTtcCents: 11000,
    });
    const versionId = await ctx.db.insert("quoteVersions", {
      quoteId, versionNumber: 1, status: "envoye", createdAt: 1, updatedAt: 1,
      discountCents: 0, issueDate: day(1), validUntil: day(30), depositPercent: 30,
      included: "", excluded: "", logistics: "", template: "libre",
      totalHtCents: 10000, totalVatCents: 1000, totalTtcCents: 11000,
    });
    await ctx.db.patch(quoteId, { currentVersionId: versionId });
    // Real prestations must remain authoritative even when the compatibility mirror is stale.
    await ctx.db.patch(requestId, { eventDate: undefined, eventStartTime: undefined, eventEndTime: undefined });
  });
  await user.mutation(api.crm.confirmService, { requestId });
  const events = await user.query(api.requestEvents.list, { requestId });
  expect(events.filter(event => event._id !== cancelledId).map(event => event.status)).toEqual(["confirmee", "confirmee"]);
  expect(events.find(event => event._id === cancelledId)?.status).toBe("annulee");
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ status: "accepte", eventDate: day(8) });
});

test("confirmation cannot resurrect a dossier whose only real prestation is cancelled", async () => {
  const { t, user, requestId } = await setup({ status: "devis_envoye" });
  await t.run(ctx => ctx.db.insert("requestEvents", {
    requestId, ...fields(8), status: "annulee", createdAt: 1, updatedAt: 1,
  }));
  await expect(user.mutation(api.crm.confirmService, { requestId })).rejects.toThrow("date et les horaires");
  expect((await user.query(api.requestEvents.list, { requestId }))[0].status).toBe("annulee");
});
