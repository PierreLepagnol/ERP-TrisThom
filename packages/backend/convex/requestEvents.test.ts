/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
vi.mock("./auth", () => ({ authComponent: { safeGetAuthUser: (ctx: MutationCtx) => ctx.auth.getUserIdentity() } }));
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const date = Date.UTC(2026, 9, 3, 12);
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "test-user" });
  const requestId = await user.mutation(api.crm.createRequest, { source: "manuel", contactName: "Romane", organizationName: "Points Communs", eventDate: date, eventStartTime: "12:00", eventEndTime: "13:00", eventType: "Plateaux", guestCount: 40 });
  return { t, user, requestId };
}
async function addQuote(t: ReturnType<typeof convexTest>, requestId: import("./_generated/dataModel").Id<"requests">) {
  return await t.run(async ctx => {
    const quoteId = await ctx.db.insert("quotes", { requestId, quoteNumber: "D-TEST", status: "envoye", createdAt: 1, updatedAt: 1, totalHtCents: 10000, totalVatCents: 1000, totalTtcCents: 11000 });
    const versionId = await ctx.db.insert("quoteVersions", { quoteId, versionNumber: 1, status: "envoye", sentAt: 1, createdAt: 1, updatedAt: 1, discountCents: 0, issueDate: date, validUntil: date, depositPercent: 30, included: "", excluded: "", logistics: "", template: "libre", totalHtCents: 10000, totalVatCents: 1000, totalTtcCents: 11000 });
    await ctx.db.patch(quoteId, { currentVersionId: versionId });
    return quoteId;
  });
}
test("a new dossier has a persistent client and no subordinate event", async () => {
  const { t, user, requestId } = await setup();
  const request = await t.run(ctx => ctx.db.get(requestId));
  expect(request?.contactId).toBeTruthy();
  expect(request?.singleServiceAt).toBeTypeOf("number");
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toEqual([]);
  expect((await user.query(api.crm.workspace, {})).requests[0].legacyEvents).toEqual([]);
  await user.mutation(api.crm.updateRequest, { requestId, changes: { eventDate: date + 86400000 } });
  expect((await t.run(ctx => ctx.db.get(requestId)))?.eventDate).toBe(date + 86400000);
});
test("manual and dedicated confirmation apply the same blockers and document changes", async () => {
  const { t, user, requestId } = await setup();
  await expect(user.mutation(api.crm.updateStatus, { requestId, status: "accepte" })).rejects.toThrow("devis envoyé");
  await expect(user.mutation(api.crm.confirmService, { requestId })).rejects.toThrow("devis envoyé");
  const quoteId = await addQuote(t, requestId);
  await user.mutation(api.crm.updateStatus, { requestId, status: "accepte" });
  expect((await t.run(ctx => ctx.db.get(quoteId)))?.status).toBe("accepte");
  await user.mutation(api.crm.updateStatus, { requestId, status: "termine" });
  expect((await t.run(ctx => ctx.db.get(requestId)))?.status).toBe("termine");
});
test("completion requires confirmation and reminders never create a business state", async () => {
  const { t, user, requestId } = await setup();
  await expect(user.mutation(api.crm.updateStatus, { requestId, status: "termine" })).rejects.toThrow("Confirmez");
  await user.mutation(api.crm.scheduleFollowUp, { requestId, title: "Appeler Romane", dueAt: date });
  expect((await t.run(ctx => ctx.db.get(requestId)))?.status).toBe("nouveau");
  await user.mutation(api.crm.updateStatus, { requestId, status: "qualifie" });
  expect((await t.run(ctx => ctx.db.get(requestId)))?.status).toBe("devis_a_preparer");
});
test("duplication retains the same client but never copies quotes, purchases or revenue", async () => {
  const { t, user, requestId } = await setup();
  await addQuote(t, requestId);
  const duplicate = await user.mutation(api.crm.duplicateRequest, { requestId, eventDate: date + 7 * 86400000 });
  const rows = await t.run(ctx => ctx.db.query("requests").collect());
  expect(rows[0].contactId).toBe(rows[1].contactId);
  expect(rows.find(row => row._id === duplicate)).toMatchObject({ status: "nouveau", eventDate: date + 7 * 86400000 });
  expect(rows.find(row => row._id === duplicate)?.quoteAmountCents).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query("quotes").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("servicePurchases").collect())).toHaveLength(0);
});
test("legacy splitting is explicit, preserves documents and archives, and cannot run twice", async () => {
  const { t, user, requestId } = await setup();
  const quoteId = await addQuote(t, requestId);
  await t.run(ctx => ctx.db.insert("servicePurchases", { requestId, product: "Pain", quantity: 40, unit: "pièce", purchased: false, createdAt: 1, updatedAt: 1 }));
  const eventIds = await t.run(async ctx => {
    await ctx.db.patch(requestId, { singleServiceAt: undefined, updatedAt: 100 });
    return await Promise.all([3, 10, 17].map(day => ctx.db.insert("requestEvents", { requestId, label: "Plateaux " + day, date: Date.UTC(2026, 9, day, 12), status: "confirmee", createdAt: 1, updatedAt: 1 })));
  });
  await expect(user.mutation(api.crm.updateStatus, { requestId, status: "accepte" })).rejects.toThrow("Reprenez");
  await expect(user.mutation(api.crm.updateRequest, { requestId, changes: { eventDate: date } })).rejects.toThrow("Reprenez");
  const args = { requestId, retainedEventId: eventIds[1], expectedUpdatedAt: 100, financialDecision: "Le devis et les achats concernent uniquement le 10 octobre." };
  const children = await user.mutation(api.crm.reviewLegacyServices, args);
  expect(children).toHaveLength(2);
  const purchases = await t.run(ctx => ctx.db.query("servicePurchases").collect());
  expect(purchases).toHaveLength(1);
  expect(purchases[0].requestId).toBe(requestId);
  expect((await t.run(ctx => ctx.db.get(quoteId)))?.requestId).toBe(requestId);
  expect(await t.run(ctx => ctx.db.query("quotes").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(3);
  expect((await t.run(ctx => ctx.db.get(requestId)))?.eventDate).toBe(Date.UTC(2026, 9, 10, 12));
  expect((await user.query(api.crm.workspace, {})).requests.every(row => row.legacyEvents.length === 0)).toBe(true);
  await expect(user.mutation(api.crm.reviewLegacyServices, args)).rejects.toThrow("changé");
});
test("old event endpoints cannot reintroduce the parallel model", async () => {
  const { t, user, requestId } = await setup();
  await expect(user.mutation(api.requestEvents.create, { requestId, fields: { label: "Autre date", status: "demandee", date } })).rejects.toThrow("Dupliquez");
  await expect(t.query(api.crm.listClients, {})).rejects.toThrow("connecté");
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toEqual([]);
});
test("Directus creates an idempotent entry and only human validation creates the dossier", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "test-user" });
  const input = { externalSourceId: "site-42", contactName: "Romane", eventDate: date };
  await t.mutation(internal.directus.ingestRequest, input);
  await t.mutation(internal.directus.ingestRequest, input);
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(0);
  const entries = await user.query(api.inboxEntries.list, { processed: false });
  expect(entries).toHaveLength(1);
  const requestId = await user.mutation(api.inboxEntries.createRequest, { inboxMessageId: entries[0]._id, contactName: "Romane" });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ source: "directus", status: "nouveau", eventDate: date });
  await expect(user.mutation(api.inboxEntries.createRequest, { inboxMessageId: entries[0]._id, contactName: "Romane" })).rejects.toThrow("déjà traitée");
});

test("invalid dates and quantities are rejected without creating partial clients", async () => {
  const { t, user, requestId } = await setup();
  await expect(user.mutation(api.crm.updateRequest, { requestId, changes: { guestCount: -2 } })).rejects.toThrow("entier positif");
  await expect(user.mutation(api.crm.createRequest, { source: "manuel", contactName: "Invalid", eventStartTime: "25:61" })).rejects.toThrow("HH:MM");
  expect(await t.run(ctx => ctx.db.query("contacts").collect())).toHaveLength(1);
});
