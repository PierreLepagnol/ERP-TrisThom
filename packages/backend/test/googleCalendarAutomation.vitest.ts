/// <reference types="vite/client" />
import { generateKeyPairSync } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { calendarDb } from "../convex/googleCalendarTracking";
import { automaticDecision, retryDelay } from "../convex/googleCalendarPlanning";
import { synchronizeCandidate, calendarFingerprint } from "../convex/googleCalendarSync";
import { projectRequest, requestSnapshot, reviewDetails } from "../convex/googleCalendarPlanning";
import type { Doc } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const credentials = { calendarId: "synthetic-calendar", accessToken: "synthetic-token" };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup(enabled = false) {
  const t = convexTest(schema, modules);
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  const id = await t.run(async ctx => {
    await ctx.db.insert("googleCalendarAutomation", { enabled });
    return calendarDb(ctx).insert("requests", { source: "manuel", status: "nouveau", contactName: "Test", missingInformation: [], eventDate: Date.parse("2027-02-03T12:00:00Z"), createdAt: Date.now(), updatedAt: Date.now() });
  });
  return { t, id };
}

test("request creation enqueues a durable job without network, disabled by default", async () => {
  const network = vi.fn(() => { throw new Error("network forbidden"); }); vi.stubGlobal("fetch", network);
  const { t, id } = await setup();
  const jobs = await t.run(ctx => ctx.db.query("googleCalendarJobs").collect());
  expect(jobs).toHaveLength(1); expect(jobs[0]?.requestId).toBe(id);
  expect(await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id })).toBeNull();
  expect(network).not.toHaveBeenCalled();
});

test("a leased worker cannot race another and a change while running is not lost", async () => {
  const { t, id } = await setup(true);
  const claim = await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id });
  expect(claim).not.toBeNull();
  expect(await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id })).toBeNull();
  await t.run(ctx => calendarDb(ctx).patch(id, { guestCount: 35 }));
  await t.mutation(internal.googleCalendarAutomation.finish, { requestId: id, revision: claim!.revision, leaseUntil: claim!.leaseUntil, status: "ok", message: "done", snapshot: "old" });
  const job = await t.run(ctx => ctx.db.query("googleCalendarJobs").unique());
  expect(job?.status).toBe("pending"); expect(job?.lastSnapshot).toBeUndefined();
});

test("failure backs off automatically and an expired lease can be recovered", async () => {
  const { t, id } = await setup(true);
  const claim = (await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id }))!;
  await t.mutation(internal.googleCalendarAutomation.finish, { requestId: id, revision: claim.revision, leaseUntil: claim.leaseUntil, status: "erreur", message: "Google unavailable" });
  expect(await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id })).toBeNull();
  vi.advanceTimersByTime(60_001);
  const retry = (await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id }))!;
  expect(retry).not.toBeNull();
  vi.setSystemTime(retry.leaseUntil + 1);
  expect(await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id })).not.toBeNull();
  expect(retryDelay(100)).toBeLessThanOrEqual(6 * 60 * 60_000);
});

test("catch-up discovers future requests already present without changing commercial fields", async () => {
  const { t, id } = await setup(true);
  await t.run(async ctx => { for (const job of await ctx.db.query("googleCalendarJobs").collect()) await ctx.db.delete(job._id); });
  await t.mutation(internal.googleCalendarAutomation.catchUp, {});
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").collect()))).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get(id)))?.status).toBe("nouveau");
});

async function syncFixture(status: Doc<"requests">["status"] = "nouveau") {
  const { t, id } = await setup();
  const request = (await t.run(ctx => ctx.db.get(id)))!;
  request.status = status;
  return { requestId: id, projection: projectRequest(request), snapshot: requestSnapshot(request, ""), review: reviewDetails(request),
    savedEventId: null as string | null, reservedEventId: null as string | null, calendarFingerprint: calendarFingerprint(credentials.calendarId), creationAttempted: false };
}

test("all future dates synchronize; undated, finished and unlinked past requests are ignored", async () => {
  const candidate = await syncFixture();
  expect(automaticDecision(candidate, Date.now())).toBeNull();
  candidate.projection.day = "2025-01-01";
  expect(automaticDecision(candidate, Date.now())).toContain("passé");
  candidate.savedEventId = "bctest";
  expect(automaticDecision(candidate, Date.now())).toBeNull();
  candidate.review.status = "termine";
  expect(automaticDecision(candidate, Date.now())).toContain("historique");
});

for (const status of ["annule", "refuse"] as const) {
  test(`${status}: only the owned ERP event is deleted, repeated attempts are harmless`, async () => {
    const candidate = await syncFixture(status); candidate.savedEventId = "bctest";
    let deleted = false;
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "DELETE") { deleted = true; return new Response(null, { status: 204 }); }
      if (deleted) return new Response(null, { status: 404 });
      return Response.json({ id: "bctest", status: "confirmed", etag: "etag", extendedProperties: { private: { requestId: candidate.requestId } } });
    });
    const deps = { automatic: true, fetch: fetchMock as typeof fetch, prepare: async () => true, record: async () => null, remove: async () => null };
    expect((await synchronizeCandidate(candidate, credentials, deps)).operation).toBe("retire");
    expect((await synchronizeCandidate(candidate, credentials, deps)).operation).toBe("retire");
    expect(methods.filter(method => method === "DELETE")).toHaveLength(1);
  });
}

test("linked manual events are never changed or deleted", async () => {
  for (const status of ["nouveau", "annule"] as const) {
    const candidate = await syncFixture(status); candidate.savedEventId = "bctest";
    const fetchMock = vi.fn(async () => Response.json({ id: "bctest", status: "confirmed", etag: "etag" }));
    expect((await synchronizeCandidate(candidate, credentials, { automatic: true, fetch: fetchMock as typeof fetch, prepare: async () => true, record: async () => null })).status).toBe("erreur");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
});

test("Google unavailable returns a retryable result, never raw credentials", async () => {
  const candidate = await syncFixture();
  const result = await synchronizeCandidate(candidate, credentials, { automatic: true, fetch: vi.fn(async () => { throw new Error("synthetic-token"); }) as typeof fetch, prepare: async () => true, record: async () => null });
  expect(result.status).toBe("erreur"); expect(JSON.stringify(result)).not.toContain("synthetic-token");
});



function fakeGoogle() {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  vi.stubEnv("GOOGLE_CALENDAR_ID", credentials.calendarId);
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "synthetic@example.invalid");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", key.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const events = new Map<string, Record<string, any>>();
  let unavailable = false;
  let failAfterInsert = false;
  const calls: { method: string; body?: Record<string, any> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (unavailable) throw new Error("network unavailable");
    if (String(url).includes("oauth2")) return Response.json({ access_token: credentials.accessToken });
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });
    const id = method === "POST" ? body.id : new URL(String(url)).pathname.split("/").at(-1)!;
    const event = events.get(id);
    if (method === "GET") return event ? Response.json(event) : new Response(null, { status: 404 });
    if (method === "POST") {
      if (event) return new Response(null, { status: 409 });
      const created = { ...body, status: "confirmed", etag: "etag" }; events.set(id, created);
      if (failAfterInsert) { failAfterInsert = false; throw new Error("response lost"); }
      return Response.json(created);
    }
    if (method === "DELETE") { events.set(id, { ...event, status: "cancelled" }); return new Response(null, { status: 204 }); }
    const updated = { ...event, ...body, etag: "next" }; events.set(id, updated); return Response.json(updated);
  }));
  return { events, calls, offline: (value: boolean) => { unavailable = value; }, loseInsertResponse: () => { failAfterInsert = true; } };
}

test("automatic worker creates future dossier, updates details and color, cancels and restores same event", async () => {
  const google = fakeGoogle(); const { t, id } = await setup(true);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.events.size).toBe(1);
  expect(google.calls.find(call => call.method === "POST")?.body?.colorId).toBe("5");
  await t.run(ctx => calendarDb(ctx).patch(id, { status: "accepte", guestCount: 42, eventAddress: "New address", eventDate: Date.parse("2027-03-03T12:00:00Z"), eventStartTime: "15:00", eventEndTime: "17:00" }));
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.events.size).toBe(1);
  const updated = [...google.events.values()][0]!;
  expect(updated.colorId).toBe("10"); expect(updated.description).toContain("42"); expect(updated.location).toBe("New address");
  expect(updated.start.dateTime).toContain("2027-03-03");
  await t.run(ctx => calendarDb(ctx).patch(id, { status: "annule" }));
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect([...google.events.values()][0]?.status).toBe("cancelled");
  await t.run(ctx => calendarDb(ctx).patch(id, { status: "devis_envoye" }));
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect([...google.events.values()][0]?.status).toBe("confirmed");
  expect([...google.events.values()][0]?.colorId).toBe("6");
  expect(google.calls.filter(call => call.method === "POST")).toHaveLength(1);
});

test("ERP saves during Google outage and the scheduled retry succeeds", async () => {
  const google = fakeGoogle(); google.offline(true); const { t, id } = await setup(true);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  await t.run(ctx => calendarDb(ctx).patch(id, { guestCount: 21 }));
  expect((await t.run(ctx => ctx.db.get(id)))?.guestCount).toBe(21);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").unique()))?.status).toBe("failed");
  google.offline(false); vi.setSystemTime(Date.now() + 60_001);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").unique()))?.status).toBe("synced");
  expect(google.events.size).toBe(1);
});

test("lost insert response is recovered with no duplicate; finished event stays historical", async () => {
  const google = fakeGoogle(); google.loseInsertResponse(); const { t, id } = await setup(true);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  vi.setSystemTime(Date.now() + 60_001);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.calls.filter(call => call.method === "POST")).toHaveLength(1);
  const before = google.calls.length;
  await t.run(ctx => calendarDb(ctx).patch(id, { status: "termine" }));
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.calls.length).toBe(before); expect([...google.events.values()][0]?.status).toBe("confirmed");
});


test("creation reservation interrupted before insert retries only the same deterministic ID", async () => {
  const google = fakeGoogle(); const { t, id } = await setup(true);
  const claim = (await t.mutation(internal.googleCalendarAutomation.claim, { requestId: id }))!;
  const candidate = await t.query(internal.googleCalendarData.getSyncCandidate, { requestId: id });
  const { eventIdFor } = await import("../convex/googleCalendarSync");
  const eventId = eventIdFor(candidate);
  await t.mutation(internal.googleCalendarData.prepareSync, { requestId: id, eventId, snapshot: candidate.snapshot, calendarFingerprint: calendarFingerprint(credentials.calendarId), reserveCreation: true, leaseUntil: claim.leaseUntil });
  vi.setSystemTime(claim.leaseUntil + 1);
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.events.size).toBe(1); expect([...google.events.keys()]).toEqual([eventId]);
  expect(google.calls.filter(call => call.method === "POST")).toHaveLength(1);
});

test("disabled automation prevents scheduled actions from contacting Google", async () => {
  const google = fakeGoogle(); const { t, id } = await setup(true);
  await t.mutation(internal.googleCalendarAutomation.setEnabled, { enabled: false, confirmation: "AUTOMATIC_GOOGLE_CALENDAR" });
  await t.action(internal.googleCalendar.automatic, { requestId: id });
  expect(google.calls).toHaveLength(0);
});

test("quote logistics writes enqueue their parent dossier and bookkeeping does not loop", async () => {
  const { t, id } = await setup();
  const quoteId = await t.run(ctx => calendarDb(ctx).insert("quotes", { requestId: id, quoteNumber: "TEST", status: "brouillon", totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0, createdAt: Date.now(), updatedAt: Date.now() }));
  const before = (await t.run(ctx => ctx.db.query("googleCalendarJobs").unique()))!.revision;
  await t.run(ctx => calendarDb(ctx).patch(quoteId, { updatedAt: Date.now() }));
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").unique()))!.revision).toBe(before + 1);
});


test("catch-up pagination handles dossiers beyond its first page", async () => {
  const { t } = await setup(true);
  await t.run(async ctx => {
    for (const job of await ctx.db.query("googleCalendarJobs").collect()) await ctx.db.delete(job._id);
    for (let index = 0; index < 27; index++) await ctx.db.insert("requests", { source: "manuel", status: "devis_a_preparer", contactName: `Future ${index}`, eventDate: Date.parse("2028-03-03T12:00:00Z"), missingInformation: [], createdAt: 0, updatedAt: 0 });
  });
  await t.mutation(internal.googleCalendarAutomation.catchUp, {});
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").collect()))).toHaveLength(25);
  await t.mutation(internal.googleCalendarAutomation.catchUp, {});
  expect((await t.run(ctx => ctx.db.query("googleCalendarJobs").collect()))).toHaveLength(28);
});
