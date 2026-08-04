import { expect, test } from "bun:test";

import { syncRecentDirectusQuoteRequests, type DirectusSyncAudit } from "../convex/directusSync";
import type { DirectusRequest } from "../convex/directusWebhook";

function harness(records: unknown, options: { failures?: number; status?: number } = {}) {
  const requests = new Map<string, DirectusRequest>();
  const audits: DirectusSyncAudit[] = [];
  let calls = 0;
  return {
    audits,
    requests,
    run: () => syncRecentDirectusQuoteRequests({
      baseUrl: "https://directus.example.test",
      fetch: async () => {
        calls += 1;
        if (calls <= (options.failures ?? 0)) throw new TypeError("network failure");
        return new Response(JSON.stringify({ data: records }), { status: options.status ?? 200 });
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
