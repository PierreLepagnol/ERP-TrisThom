export type DirectusRequest = {
  externalSourceId: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  eventType?: string;
  eventDate?: number;
  eventAddress?: string;
  guestCount?: number;
  message?: string;
};

export type WebhookAudit = {
  receivedAt: number;
  outcome: "success" | "failure";
  directusItemId?: string;
  statusCode: number;
  code: string;
  reason?: string;
};

type Dependencies = {
  expectedSecret?: string;
  requestSecret: string | null;
  bodyText: string;
  now: () => number;
  ingest: (request: DirectusRequest) => Promise<{ created: boolean }>;
  audit: (entry: WebhookAudit) => Promise<void>;
};

export async function handleDirectusQuoteRequest({ expectedSecret, requestSecret, bodyText, now, ingest, audit }: Dependencies) {
  const receivedAt = now();
  if (!expectedSecret) return await failure(audit, { receivedAt, statusCode: 503, code: "secret_not_configured", reason: "DIRECTUS_WEBHOOK_SECRET is not configured" });
  if (requestSecret !== expectedSecret) return await failure(audit, { receivedAt, statusCode: 401, code: "invalid_secret", reason: "Webhook secret does not match" });

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return await failure(audit, { receivedAt, statusCode: 400, code: "invalid_json", reason: "Request body is not valid JSON" });
  }

  const request = parseDirectusQuoteRequest(body);
  if (!request) {
    const directusItemId = findDirectusItemId(body);
    return await failure(audit, { receivedAt, directusItemId, statusCode: 400, code: "missing_directus_item_id", reason: "No Directus item id was found" });
  }

  try {
    const result = await ingest(request);
    await audit({ receivedAt, outcome: "success", directusItemId: request.externalSourceId, statusCode: 204, code: result.created ? "created" : "replayed" });
    return { status: 204, code: result.created ? "created" : "replayed" };
  } catch {
    return await failure(audit, { receivedAt, directusItemId: request.externalSourceId, statusCode: 500, code: "internal_error", reason: "Request ingestion failed" });
  }
}

async function failure(audit: Dependencies["audit"], entry: Omit<WebhookAudit, "outcome">) {
  await audit({ ...entry, outcome: "failure" });
  return { status: entry.statusCode, code: entry.code };
}

export function parseDirectusQuoteRequest(body: unknown): DirectusRequest | undefined {
  if (!isRecord(body)) return undefined;
  const record = directusRecord(body);
  const externalSourceId = findDirectusItemId(body);
  if (!externalSourceId) return undefined;
  return {
    externalSourceId,
    contactName: asString(record.name) ?? "Contact à identifier",
    contactEmail: asString(record.email),
    contactPhone: asString(record.phone),
    eventType: asString(record.catering_format ?? record.format),
    eventDate: asDate(record.event_date),
    eventAddress: asString(record.event_address),
    guestCount: asNumber(record.guest_count),
    message: asString(record.message),
  };
}

export function findDirectusItemId(body: unknown) {
  if (!isRecord(body)) return undefined;
  const payload = isRecord(body.payload) ? body.payload : undefined;
  const data = isRecord(body.data) ? body.data : undefined;
  return asIdentifier(payload?.id ?? payload?.key ?? data?.id ?? data?.key ?? body.id ?? body.key ?? body.itemId ?? body.item_id);
}

function directusRecord(body: Record<string, unknown>) {
  if (isRecord(body.payload)) return body.payload;
  if (isRecord(body.data)) return body.data;
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asIdentifier(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asString(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function asDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}
