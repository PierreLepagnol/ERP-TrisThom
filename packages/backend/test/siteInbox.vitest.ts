/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
vi.mock("../convex/auth", () => ({ authComponent: { safeGetAuthUser: async () => ({ _id: "test-user" }) } }));
const modules = import.meta.glob("../convex/**/*.ts");
test("site intake requires manual creation, preserves provenance and original message with separate editable admin notes", async () => {
  const t = convexTest(schema, modules);
  const payload = { externalSourceId: "site-test", contactName: "Initial", message: "Original\nhttps://example.test/details", adminNotes: "Ancienne note", siteStatus: "accepted", quotedAmount: 1234, format: "Livraison" };
  const result = await t.mutation(internal.directus.ingestRequest, payload);
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(0);
  expect((await t.mutation(internal.directus.ingestRequest, payload)).created).toBe(false);
  const entry = await t.run(ctx => ctx.db.query("inboxMessages").unique());
  expect(entry?.sourceData).toMatchObject({ adminNotes: "Ancienne note", quotedAmount: 1234 });
  const requestId = await t.mutation(api.inboxEntries.createRequest, { inboxMessageId: result.inboxMessageId!, contactName: "Corrigé", guestCount: 42, adminNotes: "Note corrigée" });
  const request = await t.run(ctx => ctx.db.get(requestId));
  expect(request).toMatchObject({ source: "directus", externalSourceId: "site-test", contactName: "Corrigé", guestCount: 42, status: "a_qualifier", message: payload.message });
  expect(request?.budgetCents).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query("emailMessages").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("quotes").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("requestNotes").unique())).toMatchObject({ content: "Note corrigée" });
  await expect(t.mutation(api.inboxEntries.createRequest, { inboxMessageId: entry!._id, contactName: "Duplicate" })).rejects.toThrow("déjà traitée");
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(1);
});
test("email creation keeps its existing source and email history", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert("inboxMessages", { externalId: "mail-test", body: "Email original", subject: "Sujet", attachmentNames: [], hasPdfAttachment: false, outcome: "review", reviewStatus: "pending", createdAt: 1 }));
  const requestId = await t.mutation(api.inboxEntries.createRequest, { inboxMessageId: id, contactName: "Email" });
  expect(await t.run(ctx => ctx.db.get(requestId))).toMatchObject({ source: "email", message: "Objet : Sujet\n\nEmail original" });
  expect(await t.run(ctx => ctx.db.query("emailMessages").collect())).toHaveLength(1);
});
