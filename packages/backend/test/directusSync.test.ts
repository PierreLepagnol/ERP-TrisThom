import { expect, test } from "bun:test";

import { backfillDirectusQuoteRequests, syncRecentDirectusQuoteRequests, type DirectusSyncAudit } from "../convex/directusSync";
import type { DirectusRequest } from "../convex/directusWebhook";

function harness(records: unknown[], options: { failures?: number; status?: number } = {}) {
  const requests = new Map<string, DirectusRequest>();
  const audits: DirectusSyncAudit[] = [];
  let calls = 0;
  return {
    audits,
    requests,
    run: () => syncRecentDirectusQuoteRequests({
      baseUrl: "https://directus.example.test",
      fetch: async (input) => {
        calls += 1;
        if (calls <= (options.failures ?? 0)) throw new TypeError("network failure");
        const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
        return new Response(JSON.stringify({ data: records.slice(offset, offset + 100) }), { status: options.status ?? 200 });
      },
      ingest: async (request) => {
        const created = !requests.has(request.externalSourceId);
        if (created) requests.set(request.externalSourceId, request);
        return { created };
      },
      audit: async (entry) => { audits.push(entry); },
      now: () => 1_700_000_000_000,
    }),
  };
}

test("imports missing Directus requests and does not duplicate them on replay", async () => {
  const app = harness([{ id: 54, name: "A", email: "a@example.test" }]);
  expect(await app.run()).toMatchObject({ outcome: "success", imported: 1 });
  expect(await app.run()).toMatchObject({ outcome: "success", imported: 0 });
  expect(app.requests.get("54")?.externalSourceId).toBe("54");
});

test("imports several missing records and records only technical audit details", async () => {
  const app = harness([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
  expect(await app.run()).toMatchObject({ outcome: "success", examined: 2, imported: 2 });
  expect(JSON.stringify(app.audits)).not.toContain("a@example.test");
  expect(JSON.stringify(app.audits)).not.toContain('"name"');
});

test("retries a temporary Directus network error", async () => {
  const app = harness([{ id: 3, name: "A" }], { failures: 1 });
  expect(await app.run()).toMatchObject({ outcome: "success", imported: 1 });
});

test("records unauthorized and invalid Directus responses without importing", async () => {
  const unauthorized = harness([], { status: 401 });
  expect(await unauthorized.run()).toMatchObject({ outcome: "failure", code: "directus_http_error", statusCode: 401 });
  const invalid = harness([{ name: "No id" }]);
  expect(await invalid.run()).toMatchObject({ outcome: "success", examined: 1, imported: 0, invalid: 1 });
});

test("paginates the Directus backlog instead of silently stopping after 100 requests", async () => {
  const records = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, name: `Contact ${index + 1}` }));
  const app = harness(records);
  expect(await app.run()).toMatchObject({ outcome: "success", examined: 101, imported: 101 });
  expect(app.requests.size).toBe(101);
});

test("backfills only requested Directus ids and keeps ingestion idempotent", async () => {
  const requests = new Map<string, DirectusRequest>();
  const result = await backfillDirectusQuoteRequests(["54", "58", "60", "61"], {
    baseUrl: "https://directus.example.test",
    token: "static-token",
    fetch: async (input) => {
      const id = String(input).split("/").at(-1);
      if (id === "60") return new Response("", { status: 404 });
      if (id === "61") return Response.json({ data: { id } });
      return Response.json({ data: { id, name: `Contact ${id}` } });
    },
    ingest: async (request) => {
      const created = !requests.has(request.externalSourceId);
      if (created) requests.set(request.externalSourceId, request);
      return { created };
    },
  });

  expect(result).toEqual({ tokenRequired: false, results: [
    { directusItemId: "54", outcome: "created" },
    { directusItemId: "58", outcome: "created" },
    { directusItemId: "60", outcome: "not_found" },
    { directusItemId: "61", outcome: "created" },
  ] });
  expect((await backfillDirectusQuoteRequests(["54"], {
    baseUrl: "https://directus.example.test",
    token: "static-token",
    fetch: async () => Response.json({ data: { id: "54", name: "Contact 54" } }),
    ingest: async (request) => ({ created: !requests.has(request.externalSourceId) }),
  })).results).toEqual([{ directusItemId: "54", outcome: "already_exists" }]);
});

test("stops targeted backfill when Directus requires a missing static token", async () => {
  const result = await backfillDirectusQuoteRequests(["54", "58"], {
    baseUrl: "https://directus.example.test",
    fetch: async () => new Response("", { status: 401 }),
    ingest: async () => ({ created: true }),
  });
  expect(result).toEqual({ tokenRequired: true, results: [] });
});
