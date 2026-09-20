import { v } from "convex/values";
import { authComponent } from "./auth";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
}

async function loadRequestContext(ctx: QueryCtx, requestId: Id<"requests">) {
  const request = await ctx.db.get(requestId);
  if (!request || request.deletedAt) return null;
  const [events, quotes, emails, notes, history] = await Promise.all([
    ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", requestId)).take(50),
    ctx.db.query("quotes").withIndex("by_requestId", q => q.eq("requestId", requestId)).take(20),
    ctx.db.query("emailMessages").withIndex("by_requestId_and_sentAt", q => q.eq("requestId", requestId)).order("desc").take(5),
    ctx.db.query("requestNotes").withIndex("by_requestId", q => q.eq("requestId", requestId)).order("desc").take(10),
    ctx.db.query("requestHistory").withIndex("by_requestId", q => q.eq("requestId", requestId)).order("desc").take(15),
  ]);
  return { request, events, quotes, emails, notes, history };
}

export const listPendingEntries = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);
    return (await ctx.db.query("inboxMessages").take(500))
      .filter(entry => entry.reviewStatus === "pending")
      .sort((a, b) => (b.receivedAt ?? b.createdAt) - (a.receivedAt ?? a.createdAt))
      .slice(0, limit)
      .map(entry => ({ inboxMessageId: entry._id, senderName: entry.senderName, senderEmail: entry.senderEmail, subject: entry.subject, receivedAt: entry.receivedAt ?? entry.createdAt, textPreview: entry.textPreview, attachmentNames: entry.attachmentNames, hasPdfAttachment: entry.hasPdfAttachment, reviewStatus: entry.reviewStatus, source: entry.senderEmail?.endsWith("@1001traiteurs.com") ? "1001traiteurs" : "email" }));
  },
});

export const getEntryContext = query({
  args: { inboxMessageId: v.id("inboxMessages") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const entry = await ctx.db.get(args.inboxMessageId);
    if (!entry) throw new Error("Entrée introuvable.");
    const matching = entry.senderEmail
      ? (await ctx.db.query("requests").withIndex("by_contactEmail", q => q.eq("contactEmail", entry.senderEmail!.toLowerCase())).take(20)).filter(request => !request.deletedAt)
      : [];
    return { entry: { id: entry._id, senderName: entry.senderName, senderEmail: entry.senderEmail, subject: entry.subject, receivedAt: entry.receivedAt ?? entry.createdAt, body: entry.body, attachmentNames: entry.attachmentNames, hasPdfAttachment: entry.hasPdfAttachment, reviewStatus: entry.reviewStatus, source: entry.senderEmail?.endsWith("@1001traiteurs.com") ? "1001traiteurs" : "email" }, crmContext: await Promise.all(matching.slice(0, 10).map(request => loadRequestContext(ctx, request._id))) };
  },
});

export const searchRequests = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const normalized = args.query.trim().toLocaleLowerCase("fr");
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);
    if (!normalized) return [];
    const requests = (await ctx.db.query("requests").take(500)).filter(request => {
      if (request.deletedAt) return false;
      return [request.contactName, request.contactEmail, request.organizationName, request.eventType, request.eventAddress, request.venue].filter(Boolean).some(value => value!.toLocaleLowerCase("fr").includes(normalized));
    }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    return await Promise.all(requests.map(async request => ({
      requestId: request._id, contact: request.contactName, organisation: request.organizationName, status: request.status, type: request.eventType, date: request.eventDate, eventCount: (await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", request._id)).take(50)).length, updatedAt: request.updatedAt,
    })));
  },
});

export const getRequestContext = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const context = await loadRequestContext(ctx, args.requestId);
    if (!context) throw new Error("Dossier introuvable.");
    return context;
  },
});
