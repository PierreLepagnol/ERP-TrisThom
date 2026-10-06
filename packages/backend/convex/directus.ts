import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { canCreateRequestForSource } from "./requestDeletion";

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

    const externalId = "directus:" + args.externalSourceId;
    const existingMessage = await ctx.db
      .query("inboxMessages")
      .withIndex("by_externalId", (index) => index.eq("externalId", externalId))
      .unique();

    if (existingMessage) {
      return { inboxMessageId: existingMessage._id, created: false };
    }

    const { externalSourceId, ...sourceData } = args;
    const inboxMessageId = await ctx.db.insert("inboxMessages", {
      source: "directus",
      externalId,
      senderName: args.contactName,
      senderEmail: args.contactEmail,
      subject: "Formulaire du site",
      body: args.message,
      attachmentNames: [],
      hasPdfAttachment: false,
      outcome: "review",
      reviewStatus: "pending",
      createdAt: Date.now(),
      sourceData,
    });
    return { inboxMessageId, created: true };
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
