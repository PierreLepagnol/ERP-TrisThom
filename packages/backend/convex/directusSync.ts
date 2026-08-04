import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { parseDirectusQuoteRequest, type DirectusRequest } from "./directusWebhook";

const maxAttempts = 3;
const timeoutMs = 10_000;

export type DirectusSyncAudit = {
  receivedAt: number;
  outcome: "success" | "failure";
  examined: number;
  imported: number;
  invalid: number;
  code: string;
  statusCode?: number;
  lastDirectusItemId?: string;
};

type SyncDependencies = {
  baseUrl?: string;
  token?: string;
  fetch: typeof fetch;
  ingest: (request: DirectusRequest) => Promise<{ created: boolean }>;
  audit: (entry: DirectusSyncAudit) => Promise<void>;
  now: () => number;
};

export async function syncRecentDirectusQuoteRequests({ baseUrl, token, fetch, ingest, audit, now }: SyncDependencies) {
  const receivedAt = now();
  if (!baseUrl) {
    const result = { receivedAt, outcome: "failure" as const, examined: 0, imported: 0, invalid: 0, code: "directus_not_configured" };
    await audit(result);
    return result;
  }

  let response: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}/items/quote_requests?limit=100&sort=-date_created,-id`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      break;
    } catch {
      clearTimeout(timeout);
      if (attempt === maxAttempts - 1) {
        const result = { receivedAt, outcome: "failure" as const, examined: 0, imported: 0, invalid: 0, code: "directus_network_error" };
        await audit(result);
        return result;
      }
    }
  }

  if (!response || !response.ok) {
    const result = { receivedAt, outcome: "failure" as const, examined: 0, imported: 0, invalid: 0, code: "directus_http_error", statusCode: response?.status };
    await audit(result);
    return result;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const result = { receivedAt, outcome: "failure" as const, examined: 0, imported: 0, invalid: 0, code: "directus_invalid_response" };
    await audit(result);
    return result;
  }

  const records = isRecord(payload) && Array.isArray(payload.data) ? payload.data : undefined;
  if (!records) {
    const result = { receivedAt, outcome: "failure" as const, examined: 0, imported: 0, invalid: 0, code: "directus_invalid_response" };
    await audit(result);
    return result;
  }

  let imported = 0;
  let invalid = 0;
  let lastDirectusItemId: string | undefined;
  for (const record of records) {
    const request = parseDirectusQuoteRequest(record);
    if (!request) {
      invalid += 1;
      continue;
    }
    lastDirectusItemId = request.externalSourceId;
    if ((await ingest(request)).created) imported += 1;
  }

  const result = { receivedAt, outcome: "success" as const, examined: records.length, imported, invalid, code: "directus_sync_completed", lastDirectusItemId };
  await audit(result);
  return result;
}

export const syncRecentRequests = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => await syncRecentDirectusQuoteRequests({
    baseUrl: env.DIRECTUS_BASE_URL,
    token: env.DIRECTUS_STATIC_TOKEN,
    fetch,
    ingest: async (request): Promise<{ created: boolean }> => await ctx.runMutation(internal.directus.ingestRequest, request),
    audit: async (entry): Promise<void> => { await ctx.runMutation(internal.directus.recordSyncAudit, entry); },
    now: Date.now,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
