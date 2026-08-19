import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { canCreateRequestForSource } from "./requestDeletion";

function missingInformation(args: {
  contactEmail?: string;
  contactPhone?: string;
  eventAddress?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
}) {
  const missing: string[] = [];
  if (!args.contactEmail && !args.contactPhone) missing.push("Coordonnées du contact");
  if (!args.eventDate) missing.push("Date de l'événement");
  if (!args.eventAddress) missing.push("Adresse de l'événement");
  if (!args.eventType) missing.push("Format souhaité");
  if (!args.guestCount) missing.push("Nombre de personnes");
  return missing;
}

export const ingestRequest = internalMutation({
  args: {
    externalSourceId: v.string(),
    contactName: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventAddress: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingRequest = await ctx.db
      .query("requests")
      .withIndex("by_source_and_externalSourceId", (index) =>
        index.eq("source", "directus").eq("externalSourceId", args.externalSourceId),
      )
      .unique();

    if (!canCreateRequestForSource(existingRequest)) {
      return { requestId: existingRequest._id, created: false };
    }

    const now = Date.now();
    const requestMissingInformation = missingInformation(args);
    const requestId = await ctx.db.insert("requests", {
      ...args,
      source: "directus",
      status: "nouveau",
      missingInformation: requestMissingInformation,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("requestHistory", {
      requestId,
      label: "Demande reçue depuis le site",
      createdAt: now,
    });
    return { requestId, created: true };
  },
});

export const recordWebhookAudit = internalMutation({
  args: {
    receivedAt: v.number(),
    outcome: v.union(v.literal("success"), v.literal("failure")),
    directusItemId: v.optional(v.string()),
    statusCode: v.number(),
    code: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookAuditLogs", {
      webhook: "directus_quote_request",
      ...args,
    });
  },
});

export const recordSyncAudit = internalMutation({
  args: {
    receivedAt: v.number(),
    outcome: v.union(v.literal("success"), v.literal("failure")),
    examined: v.number(),
    imported: v.number(),
    invalid: v.number(),
    code: v.string(),
    statusCode: v.optional(v.number()),
    lastDirectusItemId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("directusSyncLogs", args);
  },
});
