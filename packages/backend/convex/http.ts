import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/webhooks/directus/quote-request",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedSecret = env.DIRECTUS_WEBHOOK_SECRET;
    const requestSecret = request.headers.get("x-tristhom-webhook-secret");

    if (!expectedSecret || requestSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!isRecord(payload)) {
      return new Response("Invalid webhook payload", { status: 400 });
    }

    const record = isRecord(payload.payload) ? payload.payload : payload;
    const externalSourceId = asString(record.id ?? payload.key);
    if (!externalSourceId) {
      return new Response("Missing Directus item id", { status: 400 });
    }

    await ctx.runMutation(internal.directus.ingestRequest, {
      externalSourceId,
      contactName: asString(record.name) ?? "Contact à identifier",
      contactEmail: asString(record.email),
      contactPhone: asString(record.phone),
      eventType: asString(record.catering_format ?? record.format),
      eventDate: asDate(record.event_date),
      eventAddress: asString(record.event_address),
      guestCount: asNumber(record.guest_count),
      message: asString(record.message),
    });

    return new Response(null, { status: 204 });
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export default http;
