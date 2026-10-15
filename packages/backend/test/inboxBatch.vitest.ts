/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import * as tracking from "../convex/googleCalendarTracking";
vi.mock("../convex/auth", () => ({ authComponent: { safeGetAuthUser: async () => ({ _id: "user" }) } }));
const modules = import.meta.glob("../convex/**/*.ts");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const date = (day: string) => Date.parse(day + "T12:00:00+02:00");
async function setup() {
  const t = convexTest(schema, modules);
  const inboxMessageId = await t.run(ctx => ctx.db.insert("inboxMessages", { externalId: "saint-gratien", messageId: "<real-mail@client.test>", senderName: "Théâtre", senderEmail: "client@example.test", subject: "Six livraisons", body: "Message original avec six dates et tous les détails", attachmentNames: [], hasPdfAttachment: false, outcome: "review", reviewStatus: "pending", createdAt: 1 }));
  const args = { inboxMessageId, token: "validation-1", contactName: "Théâtre de Saint-Gratien", contactEmail: "client@example.test", contactPhone: "0123456789", rows: ["2026-10-03", "2026-10-10", "2026-11-06", "2026-11-20", "2026-11-28", "2026-12-18"].map((day, index) => ({ key: "line-" + index, eventDate: date(day), eventStartTime: "11:00", eventEndTime: "12:00", guestCount: 31, eventAddress: "Théâtre", eventType: "Livraison" })) };
  return { t, args };
}
test("six deliveries create six independent unconfirmed requests, one email, six links and existing calendar jobs", async () => {
  const { t, args } = await setup();
  const network = vi.fn(() => { throw new Error("No live network allowed"); }); vi.stubGlobal("fetch", network);
  const ids = await t.mutation(api.inboxEntries.createRequests, args);
  expect(new Set(ids).size).toBe(6);
  const workspace = await t.query(api.crm.workspace, {});
  expect(workspace.requests).toHaveLength(6);
  for (const request of workspace.requests) expect(request).toMatchObject({ status: "a_qualifier", contactName: args.contactName, contactEmail: args.contactEmail, eventType: "Livraison", guestCount: 31, message: "Objet : Six livraisons\n\nMessage original avec six dates et tous les détails" });
  // The existing Planning reads this workspace and keeps dated, non-terminal requests.
  expect(workspace.requests.filter(request => request.eventDate && !["termine", "refuse", "annule"].includes(request.status))).toHaveLength(6);
  expect(workspace.requests.map(request => request.eventDate).sort()).toEqual(args.rows.map(row => row.eventDate).sort());
  expect(await t.run(ctx => ctx.db.query("requestEvents").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("quotes").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("emailMessages").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("googleCalendarJobs").collect())).toHaveLength(6);
  for (const id of ids) {
    const emails = await t.query(api.customerEmailData.listForRequest, { requestId: id });
    expect(emails).toHaveLength(1); expect(emails[0]?.messageId).toBe("<real-mail@client.test>");
  }
  expect((await t.query(api.inboxEntries.list, { processed: true }))[0]?.requestIds).toHaveLength(6);
  expect(network).not.toHaveBeenCalled();
});
test("identical replay returns original IDs and concurrent double submission cannot create another batch", async () => {
  const { t, args } = await setup();
  const ids = await t.mutation(api.inboxEntries.createRequests, args);
  expect(await t.mutation(api.inboxEntries.createRequests, args)).toEqual(ids);
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, token: "another-token" })).rejects.toThrow("déjà traitée");
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, contactName: "Other" })).rejects.toThrow("autres valeurs");
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(6);
  expect(await t.run(ctx => ctx.db.query("inboxRequestLinks").collect())).toHaveLength(6);
});
test("invalid last line leaves the entry pending and writes nothing", async () => {
  const { t, args } = await setup();
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, rows: [...args.rows, { key: "invalid", guestCount: -1 }] })).rejects.toThrow("date");
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(args.inboxMessageId))).toMatchObject({ reviewStatus: "pending" });
});
test("failure after the first insert rolls back requests, links, emails and calendar jobs", async () => {
  const { t, args } = await setup();
  const original = tracking.calendarDb;
  let writes = 0;
  vi.spyOn(tracking, "calendarDb").mockImplementation(ctx => new Proxy(original(ctx), {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property !== "insert") return typeof value === "function" ? value.bind(target) : value;
      return async (...values: unknown[]) => {
        if (++writes === 2) throw new Error("Synthetic write failure");
        return Reflect.apply(value, target, values);
      };
    },
  }));
  await expect(t.mutation(api.inboxEntries.createRequests, args)).rejects.toThrow("Synthetic write failure");
  for (const table of ["requests", "emailMessages", "inboxRequestLinks", "googleCalendarJobs"] as const) expect(await t.run(ctx => ctx.db.query(table).collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(args.inboxMessageId))).toMatchObject({ reviewStatus: "pending" });
  vi.restoreAllMocks();
  expect(await t.mutation(api.inboxEntries.createRequests, args)).toHaveLength(6);
});
test("same client and Paris date warns, attach preserves the existing request, distinct creation needs explicit acknowledgement", async () => {
  const { t, args } = await setup();
  const existingId = await t.run(ctx => ctx.db.insert("requests", { source: "manuel", status: "accepte", contactName: "THÉÂTRE DE SAINT-GRATIEN", contactEmail: "CLIENT@EXAMPLE.TEST", eventDate: date("2026-10-03") + 3_600_000, message: "Existing description", missingInformation: [], createdAt: 1, updatedAt: 1 }));
  const before = await t.run(ctx => ctx.db.get(existingId));
  const matches = await t.query(api.inboxEntries.duplicateCandidates, { contactName: args.contactName, contactEmail: args.contactEmail, dates: [args.rows[0]!.eventDate] });
  expect(matches[0]?.[0]?._id).toBe(existingId);
  await expect(t.mutation(api.inboxEntries.createRequests, args)).rejects.toThrow("même client");
  const ids = await t.mutation(api.inboxEntries.createRequests, { ...args, rows: [{ ...args.rows[0]!, existingRequestId: existingId }, ...args.rows.slice(1)] });
  expect(ids[0]).toBe(existingId);
  expect(await t.run(ctx => ctx.db.get(existingId))).toEqual(before);
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(6);
  expect(await t.query(api.customerEmailData.listForRequest, { requestId: existingId })).toHaveLength(1);
});
test("two genuinely distinct prestations on the same day can be created after acknowledgement", async () => {
  const { t, args } = await setup();
  const rows = [{ ...args.rows[0]!, key: "lunch" }, { ...args.rows[0]!, key: "dinner", eventStartTime: "19:00", eventEndTime: "20:00" }];
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, rows })).rejects.toThrow("autre ligne");
  expect(await t.mutation(api.inboxEntries.createRequests, { ...args, rows: [rows[0]!, { ...rows[1]!, confirmDistinct: true }] })).toHaveLength(2);
});
test("single undated request remains supported; wrong-date or duplicate target attachments are rejected", async () => {
  const { t, args } = await setup();
  expect(await t.mutation(api.inboxEntries.createRequests, { ...args, rows: [{ key: "single" }] })).toHaveLength(1);
  const next = await setup();
  const existingRequestId = await next.t.run(ctx => ctx.db.insert("requests", { source: "manuel", status: "a_qualifier", contactName: "Client", eventDate: date("2026-11-01"), missingInformation: [], createdAt: 1, updatedAt: 1 }));
  await expect(next.t.mutation(api.inboxEntries.createRequests, { ...next.args, rows: [{ ...next.args.rows[0]!, existingRequestId }] })).rejects.toThrow("date doit correspondre");
});
test("site batches preserve source with unique import identities and separate administrative notes", async () => {
  const { t, args } = await setup();
  const intake = await t.mutation(internal.directus.ingestRequest, { externalSourceId: "site-six", contactName: "Site", message: "Original site", adminNotes: "Interne", quotedAmount: 5000, siteStatus: "confirmed" });
  const ids = await t.mutation(api.inboxEntries.createRequests, { ...args, inboxMessageId: intake.inboxMessageId!, adminNotes: "Corrigé", rows: args.rows.slice(0, 2) });
  const requests = await Promise.all(ids.map(id => t.run(ctx => ctx.db.get(id))));
  expect(requests.map(request => request?.externalSourceId)).toEqual(["site-six", "site-six#prestation:line-1"]);
  for (const request of requests) expect(request).toMatchObject({ source: "directus", status: "a_qualifier", message: "Original site" });
  expect(await t.run(ctx => ctx.db.query("emailMessages").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("requestNotes").collect())).toHaveLength(2);
  expect((await t.mutation(internal.directus.ingestRequest, { externalSourceId: "site-six", contactName: "Site" })).created).toBe(false);
});
test("legacy inbox and email pointers remain readable, and a shared-email reply stays pending", async () => {
  const { t, args } = await setup();
  const ids = await t.mutation(api.inboxEntries.createRequests, args);
  const reply = await t.mutation(internal.inbox.recordMessage, { externalId: "reply-1", messageId: "<reply@client.test>", inReplyTo: "<real-mail@client.test>", text: "Une modification à vérifier", attachmentNames: [], hasPdfAttachment: false });
  expect(reply).toMatchObject({ outcome: "review", reason: "pending_human_review" });
  expect(await t.run(ctx => ctx.db.get(args.inboxMessageId))).toMatchObject({ requestId: ids[0] });
  const legacy = await t.run(async ctx => {
    const requestId = await ctx.db.insert("requests", { source: "email", status: "a_qualifier", contactName: "Legacy", missingInformation: [], createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("emailMessages", { requestId, direction: "inbound", messageId: "legacy-mail", body: "Old", sentAt: 1 });
    await ctx.db.insert("inboxMessages", { externalId: "legacy-entry", requestId, attachmentNames: [], hasPdfAttachment: false, outcome: "created", reviewStatus: "attached", createdAt: 1 });
    return requestId;
  });
  expect(await t.query(api.customerEmailData.listForRequest, { requestId: legacy })).toHaveLength(1);
  expect((await t.query(api.inboxEntries.list, { processed: true })).find(entry => entry.externalId === "legacy-entry")?.requestIds).toEqual([legacy]);
});

test("concurrent requests using the same validation token return one committed batch", async () => {
  const { t, args } = await setup();
  const [first, second] = await Promise.all([t.mutation(api.inboxEntries.createRequests, args), t.mutation(api.inboxEntries.createRequests, args)]);
  expect(second).toEqual(first);
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(6);
});
test("same-day duplicate against an existing dossier can be explicitly kept as a separate service", async () => {
  const { t, args } = await setup();
  await t.run(ctx => ctx.db.insert("requests", { source: "manuel", status: "accepte", contactName: args.contactName, eventDate: args.rows[0]!.eventDate, missingInformation: [], createdAt: 1, updatedAt: 1 }));
  expect(await t.mutation(api.inboxEntries.createRequests, { ...args, rows: [{ ...args.rows[0]!, confirmDistinct: true }] })).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("requests").collect())).toHaveLength(2);
});
test("repeated existing target and invalid hours are rejected without marking the entry processed", async () => {
  const { t, args } = await setup();
  const existingRequestId = await t.run(ctx => ctx.db.insert("requests", { source: "manuel", status: "accepte", contactName: "Existing", eventDate: args.rows[0]!.eventDate, missingInformation: [], createdAt: 1, updatedAt: 1 }));
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, rows: [{ ...args.rows[0]!, existingRequestId }, { ...args.rows[0]!, key: "another", existingRequestId }] })).rejects.toThrow("deux lignes");
  await expect(t.mutation(api.inboxEntries.createRequests, { ...args, rows: [{ ...args.rows[0]!, eventStartTime: "25:00" }] })).rejects.toThrow("Horaire invalide");
  expect(await t.run(ctx => ctx.db.get(args.inboxMessageId))).toMatchObject({ reviewStatus: "pending" });
});
