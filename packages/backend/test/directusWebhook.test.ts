import { expect, test } from "bun:test";

import { handleDirectusQuoteRequest, type DirectusRequest, type WebhookAudit } from "../convex/directusWebhook";

function harness(overrides: Partial<{ expectedSecret: string | undefined; requestSecret: string | null; bodyText: string; failIngest: boolean }> = {}) {
  const audits: WebhookAudit[] = [];
  const requests = new Map<string, DirectusRequest>();
  return {
    audits,
    requests,
    run: () => handleDirectusQuoteRequest({
      expectedSecret: Object.hasOwn(overrides, "expectedSecret") ? overrides.expectedSecret : "test-secret",
      requestSecret: overrides.requestSecret ?? "test-secret",
      bodyText: overrides.bodyText ?? JSON.stringify({ payload: { id: "directus-42", name: "Ada Lovelace", email: "ada@example.test", format: "Cocktail", guest_count: "24" }, key: "directus-42" }),
      now: () => 1_700_000_000_000,
      audit: async (entry) => { audits.push(entry); },
      ingest: async (request) => {
        if (overrides.failIngest) throw new Error("database failure");
        const created = !requests.has(request.externalSourceId);
        if (created) requests.set(request.externalSourceId, request);
        return { created };
      },
    }),
  };
}

test("rejects and audits a webhook when the configured secret is absent", async () => {
  const app = harness({ expectedSecret: undefined });
  expect(await app.run()).toEqual({ status: 503, code: "secret_not_configured" });
  expect(app.audits).toEqual([{ receivedAt: 1_700_000_000_000, outcome: "failure", statusCode: 503, code: "secret_not_configured", reason: "DIRECTUS_WEBHOOK_SECRET is not configured" }]);
});

test("rejects and audits a bad secret without retaining the request body", async () => {
  const app = harness({ requestSecret: "wrong-secret" });
  expect(await app.run()).toEqual({ status: 401, code: "invalid_secret" });
  expect(app.audits[0]).toMatchObject({ outcome: "failure", code: "invalid_secret" });
  expect(JSON.stringify(app.audits)).not.toContain("Ada Lovelace");
});

test("rejects invalid JSON and missing Directus ids", async () => {
  const invalidJson = harness({ bodyText: "{" });
  expect(await invalidJson.run()).toEqual({ status: 400, code: "invalid_json" });
  const missingId = harness({ bodyText: JSON.stringify({ payload: { name: "Ada Lovelace" } }) });
  expect(await missingId.run()).toEqual({ status: 400, code: "missing_directus_item_id" });
});

test("accepts the Directus Flow envelope and creates exactly one request on replay", async () => {
  const app = harness();
  expect(await app.run()).toEqual({ status: 204, code: "created" });
  expect(await app.run()).toEqual({ status: 204, code: "replayed" });
  expect([...app.requests.values()]).toEqual([expect.objectContaining({ externalSourceId: "directus-42", contactName: "Ada Lovelace", guestCount: 24 })]);
  expect(app.audits.map((audit) => audit.code)).toEqual(["created", "replayed"]);
});

test("accepts Directus records sent directly and uses key when payload has no id", async () => {
  const direct = harness({ bodyText: JSON.stringify({ id: 75, name: "Direct record" }) });
  await direct.run();
  expect(direct.requests.get("75")?.contactName).toBe("Direct record");
  const keyed = harness({ bodyText: JSON.stringify({ payload: { name: "Flow record" }, key: "flow-76" }) });
  await keyed.run();
  expect(keyed.requests.get("flow-76")?.contactName).toBe("Flow record");
  const payloadKeyed = harness({ bodyText: JSON.stringify({ payload: { key: "flow-77", name: "Nested key" } }) });
  await payloadKeyed.run();
  expect(payloadKeyed.requests.get("flow-77")?.contactName).toBe("Nested key");
});

test("audits an internal ingestion failure without persisting personal data", async () => {
  const app = harness({ failIngest: true });
  expect(await app.run()).toEqual({ status: 500, code: "internal_error" });
  expect(app.audits[0]).toEqual(expect.objectContaining({ outcome: "failure", directusItemId: "directus-42", reason: "Request ingestion failed" }));
  expect(JSON.stringify(app.audits)).not.toContain("Ada Lovelace");
});
