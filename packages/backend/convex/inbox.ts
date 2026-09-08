import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

export const getOrStartImport = internalMutation({
  args: { enabledAt: v.number(), lastSeenUid: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("inboxImportState")
      .withIndex("by_key", (index) => index.eq("key", "email_import"))
      .unique();
    if (existing) return existing;
    const state = { key: "email_import" as const, enabledAt: args.enabledAt, lastSeenUid: args.lastSeenUid };
    await ctx.db.insert("inboxImportState", state);
    return state;
  },
});

export const advanceImportCursor = internalMutation({
  args: { lastSeenUid: v.number() },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("inboxImportState")
      .withIndex("by_key", (index) => index.eq("key", "email_import"))
      .unique();
    if (!state || args.lastSeenUid <= state.lastSeenUid) return;
    await ctx.db.patch(state._id, { lastSeenUid: args.lastSeenUid });
  },
});

export const recordMessage = internalMutation({
  args: {
    externalId: v.string(), messageId: v.optional(v.string()), inReplyTo: v.optional(v.string()),
    senderName: v.optional(v.string()), senderEmail: v.optional(v.string()), subject: v.optional(v.string()),
    receivedAt: v.optional(v.number()), text: v.optional(v.string()), pdfText: v.optional(v.string()),
    attachmentNames: v.array(v.string()), hasPdfAttachment: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("inboxMessages")
      .withIndex("by_externalId", (index) => index.eq("externalId", args.externalId)).unique();
    if (existing) return { outcome: "ignored" as const, requestId: existing.requestId, reason: "already_processed" };

    const now = Date.now();
    const threaded = args.inReplyTo
      ? await ctx.db.query("emailMessages").withIndex("by_messageId", (index) => index.eq("messageId", args.inReplyTo!)).unique()
      : null;

    if (threaded) {
      const inboxMessageId = await ctx.db.insert("inboxMessages", {
        externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
        subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
        attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
        outcome: "created", reviewStatus: "attached", requestId: threaded.requestId, createdAt: now,
      });
      await ctx.db.insert("requestHistory", { requestId: threaded.requestId, label: "Nouvelle réponse reçue par e-mail", createdAt: now });
      await ctx.db.insert("emailMessages", {
        requestId: threaded.requestId, direction: "inbound", messageId: args.messageId ?? args.externalId,
        inReplyTo: args.inReplyTo, subject: args.subject, body: args.text ?? "", senderEmail: args.senderEmail,
        attachmentNames: args.attachmentNames.slice(0, 20),
        sentAt: args.receivedAt ?? now,
      });
      return { outcome: "created" as const, requestId: threaded.requestId, reason: "thread_match" };
    }

    if (!args.subject?.trim() && !args.text?.trim() && !args.pdfText?.trim() && args.attachmentNames.length === 0) {
      await ctx.db.insert("inboxMessages", {
        externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
        subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
        attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
        outcome: "ignored",
        createdAt: now,
      });
      return { outcome: "ignored" as const, reason: "empty_message" };
    }

    await ctx.db.insert("inboxMessages", {
      externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
      subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
      attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
      outcome: "review", reviewStatus: "pending", createdAt: now,
    });
    return { outcome: "review" as const, reason: "pending_human_review" };
  },
});
