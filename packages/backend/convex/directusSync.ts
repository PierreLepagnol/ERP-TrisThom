import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { parseDirectusQuoteRequest, type DirectusRequest } from "./directusWebhook";

const maxAttempts = 3;
const timeoutMs = 10_000;
const pageSize = 100;
const maxPagesPerRun = 100;

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

  let imported = 0;
  let invalid = 0;
  let examined = 0;
  let lastDirectusItemId: string | undefined;
  for (let page = 0; page < maxPagesPerRun; page += 1) {
    const pageResult = await fetchPage({ baseUrl, token, fetch, offset: page * pageSize });
    if (pageResult.kind === "failure") {
      const result = { receivedAt, outcome: "failure" as const, examined, imported, invalid, code: pageResult.code, ...(pageResult.statusCode ? { statusCode: pageResult.statusCode } : {}) };
      await audit(result);
      return result;
    }
    const records = pageResult.records;
    examined += records.length;
    for (const record of records) {
      const request = parseDirectusQuoteRequest(record);
      if (!request) {
        invalid += 1;
        continue;
      }
      lastDirectusItemId = request.externalSourceId;
      if ((await ingest(request)).created) imported += 1;
    }
    if (records.length < pageSize) {
      const result = { receivedAt, outcome: "success" as const, examined, imported, invalid, code: "directus_sync_completed", lastDirectusItemId };
      await audit(result);
      return result;
    }
  }

  const result = { receivedAt, outcome: "failure" as const, examined, imported, invalid, code: "directus_sync_page_limit_reached", lastDirectusItemId };
  await audit(result);
  return result;
}

async function fetchPage({ baseUrl, token, fetch, offset }: Pick<SyncDependencies, "baseUrl" | "token" | "fetch"> & { offset: number }) {
  let response: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const query = new URLSearchParams({ limit: String(pageSize), offset: String(offset), sort: "date_created,id" });
      response = await fetch(`${baseUrl!.replace(/\/$/, "")}/items/quote_requests?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      break;
    } catch {
      clearTimeout(timeout);
      if (attempt === maxAttempts - 1) return { kind: "failure" as const, code: "directus_network_error" };
    }
  }
  if (!response || !response.ok) return { kind: "failure" as const, code: "directus_http_error", statusCode: response?.status };
  try {
    const payload: unknown = await response.json();
    const records = isRecord(payload) && Array.isArray(payload.data) ? payload.data : undefined;
    return records ? { kind: "success" as const, records } : { kind: "failure" as const, code: "directus_invalid_response" };
  } catch {
    return { kind: "failure" as const, code: "directus_invalid_response" };
  }
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
