import { v } from "convex/values";

import { authComponent } from "./auth";
import { env, internalMutation, query } from "./_generated/server";

export const listForRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    if (!await authComponent.safeGetAuthUser(ctx)) {
      throw new Error("Vous devez être connecté.");
    }
    return await ctx.db
      .query("emailMessages")
      .withIndex("by_requestId_and_sentAt", (index) => index.eq("requestId", requestId))
      .collect();
  },
});

export const recordOutgoing = internalMutation({
  args: {
    requestId: v.id("requests"),
    recipientEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    messageId: v.string(),
    inReplyTo: v.optional(v.string()),
    attachmentNames: v.optional(v.array(v.string())),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("emailMessages", {
      requestId: args.requestId,
      direction: "outbound",
      messageId: args.messageId,
      inReplyTo: args.inReplyTo,
      subject: args.subject,
      body: args.body,
      senderEmail: env.SMTP_FROM,
      recipientEmail: args.recipientEmail,
      attachmentNames: args.attachmentNames,
      sentAt: args.sentAt,
    });
    await ctx.db.insert("requestHistory", {
      requestId: args.requestId,
      label: "E-mail envoyé au client",
      createdAt: args.sentAt,
    });
    await ctx.db.patch(args.requestId, { updatedAt: args.sentAt });
  },
});
