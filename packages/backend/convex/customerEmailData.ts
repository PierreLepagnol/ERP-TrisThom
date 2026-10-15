import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";

import { authComponent } from "./auth";
import { env, internalMutation, query } from "./_generated/server";

export const listForRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    if (!await authComponent.safeGetAuthUser(ctx)) {
      throw new Error("Vous devez être connecté.");
    }
    return await requestEmails(ctx, requestId);
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

// Shared received messages retain their real messageId and are stored only once.
export async function requestEmails(ctx: QueryCtx, requestId: Id<"requests">) {
  const direct = await ctx.db.query("emailMessages").withIndex("by_requestId_and_sentAt", q => q.eq("requestId", requestId)).order("desc").take(500);
  const links = await ctx.db.query("inboxRequestLinks").withIndex("by_requestId", q => q.eq("requestId", requestId)).take(500);
  const shared = await Promise.all(links.map(link => link.emailMessageId ? ctx.db.get(link.emailMessageId) : null));
  const unique = new Map<string, Doc<"emailMessages">>();
  for (const message of [...direct, ...shared]) if (message) unique.set(message._id, message);
  return [...unique.values()].sort((a, b) => a.sentAt - b.sentAt);
}