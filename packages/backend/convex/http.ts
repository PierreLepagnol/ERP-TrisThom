import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { handleDirectusQuoteRequest } from "./directusWebhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/webhooks/directus/quote-request",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const result = await handleDirectusQuoteRequest({
      expectedSecret: env.DIRECTUS_WEBHOOK_SECRET,
      requestSecret: request.headers.get("x-tristhom-webhook-secret"),
      bodyText: await request.text(),
      now: Date.now,
      ingest: async (args) => await ctx.runMutation(internal.directus.ingestRequest, args),
      audit: async (entry) => {
        await ctx.runMutation(internal.directus.recordWebhookAudit, entry);
      },
    });
    return new Response(result.status === 204 ? null : result.code, { status: result.status });
  }),
});

http.route({
  path: "/webhooks/directus/quote-request/diagnostic",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const expectedSecret = env.DIRECTUS_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return Response.json({ routeDeployed: true, directusWebhookSecretConfigured: false, secretMatches: false }, { status: 503 });
    }
    if (request.headers.get("x-tristhom-webhook-secret") !== expectedSecret) {
      return new Response("invalid_secret", { status: 401 });
    }
    return Response.json({ routeDeployed: true, directusWebhookSecretConfigured: true, secretMatches: true });
  }),
});

export default http;
