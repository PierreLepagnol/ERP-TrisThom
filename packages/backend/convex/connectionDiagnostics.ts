import { v } from "convex/values";

import { authComponent } from "./auth";
import { env, query } from "./_generated/server";

export type ConnectionStatus = "non_configure" | "configure_non_teste" | "ok" | "erreur";

type AuditEvent = { receivedAt: number; outcome: "success" | "failure"; code: string };

function configured(...values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

export function statusFromAudit(isConfigured: boolean, events: AuditEvent[]): ConnectionStatus {
  if (!isConfigured) return "non_configure";
  const latest = events.reduce<AuditEvent | undefined>((current, event) =>
    !current || event.receivedAt > current.receivedAt ? event : current,
  undefined);
  if (!latest) return "configure_non_teste";
  return latest.outcome === "success" ? "ok" : "erreur";
}

function latestEvent(events: AuditEvent[]) {
  return events.reduce<AuditEvent | undefined>((current, event) =>
    !current || event.receivedAt > current.receivedAt ? event : current,
  undefined);
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");

    const [webhookAudits, syncAudits] = await Promise.all([
      ctx.db.query("webhookAuditLogs")
        .withIndex("by_webhook_and_receivedAt", (index) => index.eq("webhook", "directus_quote_request"))
        .order("desc")
        .take(100),
      ctx.db.query("directusSyncLogs").withIndex("by_receivedAt").order("desc").take(100),
    ]);
    const webhookEvents = webhookAudits.map(({ receivedAt, outcome, code }) => ({ receivedAt, outcome, code }));
    const syncEvents = syncAudits.map(({ receivedAt, outcome, code }) => ({ receivedAt, outcome, code }));
    const lastWebhook = latestEvent(webhookEvents);
    const lastSync = latestEvent(syncEvents);
    const lastCreatedWebhook = webhookAudits.find((entry) => entry.outcome === "success" && entry.code === "created");
    const lastWebhookFailure = webhookAudits.find((entry) => entry.outcome === "failure");
    const lastSyncFailure = syncAudits.find((entry) => entry.outcome === "failure");

    return {
      convex: { status: "ok" as const, lastEventAt: Date.now() },
      betterAuth: {
        status: configured(env.BETTER_AUTH_SECRET, env.SITE_URL) ? "ok" as const : "non_configure" as const,
        lastEventAt: Date.now(),
      },
      directusWebhook: {
        status: statusFromAudit(configured(env.DIRECTUS_WEBHOOK_SECRET), webhookEvents),
        deployed: true,
        secretConfigured: configured(env.DIRECTUS_WEBHOOK_SECRET),
        lastEventAt: lastWebhook?.receivedAt,
        lastErrorCode: lastWebhookFailure?.code,
        lastFailureAt: lastWebhookFailure?.receivedAt,
        lastCreatedAt: lastCreatedWebhook?.receivedAt,
      },
      directusSync: {
        status: statusFromAudit(configured(env.DIRECTUS_BASE_URL), syncEvents),
        lastEventAt: lastSync?.receivedAt,
        lastErrorCode: lastSyncFailure?.code,
        lastFailureAt: lastSyncFailure?.receivedAt,
      },
      imap: {
        status: configured(env.IMAP_HOST, env.IMAP_PORT, env.IMAP_SECURE, env.SMTP_USER, env.SMTP_PASSWORD)
          ? "configure_non_teste" as const
          : "non_configure" as const,
      },
      smtp: {
        status: configured(env.SMTP_HOST, env.SMTP_PORT, env.SMTP_SECURE, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM)
          ? "configure_non_teste" as const
          : "non_configure" as const,
      },
    };
  },
});

export const statusValidator = v.union(
  v.literal("non_configure"),
  v.literal("configure_non_teste"),
  v.literal("ok"),
  v.literal("erreur"),
);
